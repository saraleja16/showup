using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ShowUpBackend.Configuration;
using ShowUpBackend.Data;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Models.Entities;
using ShowUpBackend.Repositories.Interfaces;
using ShowUpBackend.Services.Interfaces;
using ShowUpBackend.Services.Matchmaking;
using ShowUpBackend.Sports;

namespace ShowUpBackend.Services;

public class EventService : IEventService
{
    private readonly IEventRepository _eventRepository;
    private readonly IUserRepository _userRepository;
    private readonly IVenueRepository _venueRepository;
    private readonly INotificationService _notificationService;
    private readonly IPositionRepository _positionRepository;
    private readonly IJoinRequestRepository _joinRequestRepository;
    private readonly AppDbContext _context;
    private readonly EventLifecycleOptions _lifecycleOptions;
    private readonly AttendanceOptions _attendanceOptions;

    public EventService(
        IEventRepository eventRepository,
        IUserRepository userRepository,
        IVenueRepository venueRepository,
        INotificationService notificationService,
        IPositionRepository positionRepository,
        IJoinRequestRepository joinRequestRepository,
        AppDbContext context,
        IOptions<EventLifecycleOptions> lifecycleOptions,
        IOptions<AttendanceOptions> attendanceOptions)
    {
        _eventRepository = eventRepository;
        _userRepository = userRepository;
        _venueRepository = venueRepository;
        _notificationService = notificationService;
        _positionRepository = positionRepository;
        _joinRequestRepository = joinRequestRepository;
        _context = context;
        _lifecycleOptions = lifecycleOptions.Value;
        _attendanceOptions = attendanceOptions.Value;
    }

    /// <summary>
    /// Returns the set of "other user" ids connected (matched) to <paramref name="userId"/>.
    /// </summary>
    private async Task<HashSet<Guid>> GetConnectedUserIdsAsync(Guid userId)
    {
        var ids = await _context.Connections.AsNoTracking()
            .Where(c => c.UserAId == userId || c.UserBId == userId)
            .Select(c => c.UserAId == userId ? c.UserBId : c.UserAId)
            .ToListAsync();
        return ids.ToHashSet();
    }

    /// <summary>
    /// A private event is visible to its creator, to users with a mutual Connection (match)
    /// to the creator, and to anyone who already holds a participant row on it (so a match
    /// that later unmatches doesn't retroactively hide an event they already joined).
    /// </summary>
    private async Task<bool> CanViewPrivateEventAsync(Event ev, Guid? userId)
    {
        if (!ev.IsPrivate) return true;
        if (!userId.HasValue) return false;
        if (ev.CreatorId == userId.Value) return true;

        var participant = await _eventRepository.GetParticipantAsync(ev.Id, userId.Value);
        if (participant is not null) return true;

        var connected = await GetConnectedUserIdsAsync(userId.Value);
        return connected.Contains(ev.CreatorId);
    }

    public async Task<List<EventDto>> GetAllEventsAsync(Guid? userId = null)
    {
        var events = await _eventRepository.GetAllAsync();
        events = await FilterPrivateEventsAsync(events, userId);
        return await MapEventsToDtosAsync(events, userId);
    }

    public async Task<List<EventDto>> SearchEventsAsync(EventSearchFilters filters, Guid userId)
    {
        double? originLat = filters.ResolvedLocation?.Latitude;
        double? originLng = filters.ResolvedLocation?.Longitude;

        // Explicit searched location always wins. Only fall back to the caller's
        // stored location when no place was resolved and a radius filter is set.
        if (originLat is null || originLng is null)
        {
            if (filters.RadiusKm is not null)
            {
                var user = await _userRepository.GetUserByIdAsync(userId);
                if (user?.Latitude is null || user.Longitude is null)
                    return [];

                originLat = user.Latitude;
                originLng = user.Longitude;
            }
        }

        var events = await _eventRepository.SearchAsync(filters, originLat, originLng);
        events = await FilterPrivateEventsAsync(events, userId);
        var dtos = await MapEventsToDtosAsync(events, userId);

        if (originLat is not null && originLng is not null)
        {
            foreach (var dto in dtos)
            {
                dto.DistanceKm = Math.Round(
                    GeoDistance.HaversineKm(originLat.Value, originLng.Value, dto.Latitude, dto.Longitude),
                    1,
                    MidpointRounding.AwayFromZero);
            }

            dtos = dtos
                .OrderBy(d => d.DistanceKm ?? double.MaxValue)
                .ThenBy(d => d.ScheduledAt)
                .ToList();
        }

        return dtos;
    }

    /// <summary>
    /// Private events are hidden from anyone who isn't the creator, an existing
    /// participant, or a matched connection of the creator. Only bother querying
    /// Connections/Participants when the result set actually contains private events.
    /// </summary>
    private async Task<List<Event>> FilterPrivateEventsAsync(List<Event> events, Guid? userId)
    {
        if (!events.Any(e => e.IsPrivate))
            return events;

        var connectedCreatorIds = userId.HasValue
            ? await GetConnectedUserIdsAsync(userId.Value)
            : [];

        var participantEventIds = userId.HasValue
            ? (await _context.EventParticipants.AsNoTracking()
                .Where(p => p.UserId == userId.Value)
                .Select(p => p.EventId)
                .ToListAsync()).ToHashSet()
            : [];

        return events.Where(ev =>
            !ev.IsPrivate ||
            (userId.HasValue && (
                ev.CreatorId == userId.Value ||
                connectedCreatorIds.Contains(ev.CreatorId) ||
                participantEventIds.Contains(ev.Id)))
        ).ToList();
    }

    private async Task<List<EventDto>> MapEventsToDtosAsync(List<Event> events, Guid? userId)
    {
        var ids = events.Select(e => e.Id).ToList();
        if (ids.Count == 0) return [];

        // Two bulk queries always; additional ones only when the caller identifies themselves.
        var participantCounts = await _eventRepository.GetParticipantCountsByEventAsync(ids);
        var positionCounts    = await _eventRepository.GetClaimedPositionCountsByEventAsync(ids);

        Dictionary<Guid, string>?  statuses           = null;
        Dictionary<Guid, int>?     pendingCounts       = null;
        HashSet<Guid>?             myPendingEventIds   = null;

        if (userId.HasValue)
        {
            statuses         = await _eventRepository.GetStatusesByUserAsync(userId.Value, ids);
            pendingCounts    = await _joinRequestRepository.GetPendingCountsByEventAsync(ids);
            myPendingEventIds = await _joinRequestRepository.GetEventIdsWithPendingByRequesterAsync(userId.Value, ids);
        }

        // Shared lifecycle/result projection — one result query for the whole page (no N+1).
        var results = await _context.EventResults.AsNoTracking()
            .Where(r => ids.Contains(r.EventId))
            .ToDictionaryAsync(r => r.EventId);

        var attendanceRows = await _context.EventParticipants.AsNoTracking()
            .Where(p => ids.Contains(p.EventId) &&
                        p.Status != ParticipationStatus.CancelledEarly &&
                        p.Status != ParticipationStatus.CancelledLate)
            .Select(p => new { p.EventId, p.UserId, p.Status })
            .ToListAsync();

        var attendanceByEvent = attendanceRows
            .GroupBy(p => p.EventId)
            .ToDictionary(g => g.Key, g => g.ToList());

        var now = DateTime.UtcNow;
        var soonMinutes = _lifecycleOptions.StartingSoonMinutes > 0
            ? _lifecycleOptions.StartingSoonMinutes
            : EventLifecycleCalculator.StartingSoonMinutes;

        return events.Select(ev =>
        {
            // Presence in positionCounts = event has position rows → use claimed-slot count.
            // Absence = no positions (tennis, custom, pre-existing) → fall back to participant count.
            var hasPositions = positionCounts.ContainsKey(ev.Id);
            var claimedCount = hasPositions ? positionCounts[ev.Id] : (int?)null;
            var count = hasPositions
                ? positionCounts[ev.Id]
                : participantCounts.GetValueOrDefault(ev.Id);

            string? myStatus = statuses is not null && statuses.TryGetValue(ev.Id, out var s) ? s : null;

            // pendingRequestCount: only for the host's own events.
            int? pendingRequestCount = null;
            if (userId.HasValue && ev.CreatorId == userId.Value && pendingCounts is not null)
                pendingRequestCount = pendingCounts.TryGetValue(ev.Id, out var prc) ? prc : 0;

            // myRequestStatus: "pending" when caller has a Pending request on this event.
            string? myRequestStatus = null;
            if (userId.HasValue && myPendingEventIds is not null && myPendingEventIds.Contains(ev.Id))
                myRequestStatus = "pending";

            results.TryGetValue(ev.Id, out var result);
            var parts = attendanceByEvent.GetValueOrDefault(ev.Id) ?? [];
            var isHost = userId.HasValue && ev.CreatorId == userId.Value;
            var isActiveParticipant = userId.HasValue && (
                isHost ||
                parts.Any(p => p.UserId == userId.Value));

            var snap = EventStatusProjection.Build(
                ev, now, result, soonMinutes, isHost, isActiveParticipant);
            snap = snap with
            {
                Permissions = EventStatusProjection.ResolvePermissionsForViewer(
                    ev, now, result, userId, isHost, isActiveParticipant)
            };

            var present = parts.Count(p => p.Status == ParticipationStatus.Attended);
            var absent = parts.Count(p =>
                p.Status is ParticipationStatus.NoShow or ParticipationStatus.Excused);
            var pending = parts.Count - present - absent;

            return MapToDto(ev, count, null,
                userId.HasValue ? myStatus : null,
                userId.HasValue ? (bool?)hasPositions : null,
                userId.HasValue ? claimedCount : null,
                userId.HasValue ? pendingRequestCount : null,
                userId.HasValue ? myRequestStatus : null,
                snap,
                present,
                pending,
                absent);
        }).ToList();
    }

    public async Task<EventDto?> GetEventByIdAsync(Guid id, Guid? userId = null)
    {
        var ev = await _eventRepository.GetByIdAsync(id);
        if (ev is null) return null;

        // Treat a private event the caller can't see as not found, so its existence
        // (title, schedule, host) isn't leaked to unmatched users.
        if (!await CanViewPrivateEventAsync(ev, userId)) return null;

        var mapped = await MapEventsToDtosAsync([ev], userId);
        return mapped.FirstOrDefault();
    }

    public async Task<(EventDto? Event, string? Error, int StatusCode)> CreateEventAsync(CreateEventRequest request)
    {
        // --- Sport validation ---
        var sportDef = SportCatalog.Get(request.Sport);
        if (sportDef is null)
            return (null, $"Unknown or unsupported sport: '{request.Sport}'", StatusCodes.Status400BadRequest);

        // Serialize SportDetails for downstream validation/storage
        string? sportDetailsJson = request.SportDetails.HasValue
            ? JsonSerializer.Serialize(request.SportDetails.Value)
            : null;

        var detailsError = sportDef.Validate(sportDetailsJson);
        if (detailsError is not null)
            return (null, detailsError, StatusCodes.Status400BadRequest);

        // --- Capacity ---
        int maxPlayers;
        if (sportDef.DerivesCapacity)
        {
            maxPlayers = sportDef.ResolveCapacity(sportDetailsJson);
        }
        else
        {
            if (request.MaxPlayers is null or < 1)
                return (null, "MaxPlayers must be at least 1 for this sport", StatusCodes.Status400BadRequest);
            maxPlayers = request.MaxPlayers.Value;
        }

        // --- Date ---
        if (request.ScheduledAt == default)
            return (null, "Date and time are required", StatusCodes.Status400BadRequest);

        var scheduledAtUtc = request.ScheduledAt.Kind == DateTimeKind.Unspecified
            ? DateTime.SpecifyKind(request.ScheduledAt, DateTimeKind.Utc)
            : request.ScheduledAt.ToUniversalTime();

        if (scheduledAtUtc <= DateTime.UtcNow)
            return (null, "Event date and time cannot be in the past", StatusCodes.Status400BadRequest);

        // --- Venue / Location ---
        double eventLatitude;
        double eventLongitude;

        if (sportDef.RequiresVenue)
        {
            if (request.VenueId is null)
                return (null, $"A venue is required for {sportDef.SportId} events", StatusCodes.Status400BadRequest);

            var venue = await _venueRepository.GetByIdAsync(request.VenueId.Value);
            if (venue is null || !venue.IsActive)
                return (null, "Venue not found or is not active", StatusCodes.Status400BadRequest);

            var supportsSport = venue.Sports
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Any(s => s.Equals(sportDef.SportId, StringComparison.OrdinalIgnoreCase));

            if (!supportsSport)
                return (null, $"Selected venue does not support {sportDef.SportId}", StatusCodes.Status400BadRequest);

            // Derive coordinates from the validated venue — client need not send lat/lng.
            eventLatitude = venue.Latitude;
            eventLongitude = venue.Longitude;
        }
        else
        {
            if (request.Latitude is < -90 or > 90 || request.Longitude is < -180 or > 180 ||
                (request.Latitude == 0 && request.Longitude == 0))
                return (null, "Location is required", StatusCodes.Status400BadRequest);

            eventLatitude = request.Latitude;
            eventLongitude = request.Longitude;
        }

        // Validate InitialClaims slot IDs before writing anything to the DB.
        if (request.InitialClaims is { Count: > 0 })
        {
            if (sportDef is not IHasFormations hasFormationsForValidation || sportDetailsJson is null)
                return (null, "InitialClaims are only supported for sports with fixed formations", StatusCodes.Status400BadRequest);

            var vformat = hasFormationsForValidation.ExtractFormat(sportDetailsJson);
            var vslots = hasFormationsForValidation.GetFormationSlots(vformat);

            if (vslots.Count == 0)
                return (null, "Cannot pre-claim slots for custom-format events (no fixed formation)", StatusCodes.Status400BadRequest);

            var validIds = vslots.Select(s => s.SlotId).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var badIds = request.InitialClaims
                .Where(c => !validIds.Contains(c.SlotId))
                .Select(c => c.SlotId)
                .ToList();
            if (badIds.Count > 0)
                return (null, $"Invalid slot IDs for this formation: {string.Join(", ", badIds)}", StatusCodes.Status400BadRequest);
        }

        if (request.TotalCost is < 0)
            return (null, "TotalCost cannot be negative", StatusCodes.Status400BadRequest);

        string? requiredSkill = null;
        if (!string.IsNullOrWhiteSpace(request.RequiredSkillLevel))
        {
            if (!SkillLevels.IsValid(request.RequiredSkillLevel))
                return (null, "RequiredSkillLevel must be Beginner, Intermediate, or Advanced", StatusCodes.Status400BadRequest);
            requiredSkill = SkillLevels.Normalize(request.RequiredSkillLevel);
        }

        var ev = new Event
        {
            Id = Guid.NewGuid(),
            Title = request.Title,
            Description = request.Description,
            CreatorId = request.CreatorId,
            Latitude = eventLatitude,
            Longitude = eventLongitude,
            ScheduledAt = scheduledAtUtc,
            MaxPlayers = maxPlayers,
            Sport = sportDef.SportId,
            SportDetails = sportDetailsJson,
            VenueId = sportDef.RequiresVenue ? request.VenueId : null,
            IsPrivate = request.IsPrivate,
            TotalCost = request.TotalCost is > 0 ? decimal.Round(request.TotalCost.Value, 2) : null,
            RequiredSkillLevel = requiredSkill,
            CreatedAt = DateTime.UtcNow
        };

        var created = await _eventRepository.CreateAsync(ev);

        // Register the creator as a participant immediately — they always occupy a spot.
        await _eventRepository.AddParticipantAsync(new EventParticipant
        {
            Id = Guid.NewGuid(),
            EventId = created.Id,
            UserId = created.CreatorId,
            Status = ParticipationStatus.Registered,
            JoinedAt = DateTime.UtcNow
        });

        // Generate and insert EventPositions for any sport that implements IHasFormations.
        List<PositionSlotDto>? initialPositions = null;
        if (sportDef is IHasFormations hasFormations && sportDetailsJson is not null)
        {
            var format = hasFormations.ExtractFormat(sportDetailsJson);
            var templateSlots = hasFormations.GetFormationSlots(format);

            if (templateSlots.Count > 0)
            {
                await _positionRepository.BulkInsertAsync(templateSlots.Select(s => new EventPosition
                {
                    EventId = created.Id,
                    SlotId = s.SlotId,
                    Team = s.Team,
                    Role = s.Role,
                    X = s.X,
                    Y = s.Y,
                    Status = "open"
                }));

                // Apply pre-claims from the creation request (slot IDs already validated above).
                if (request.InitialClaims is { Count: > 0 })
                {
                    foreach (var claim in request.InitialClaims)
                    {
                        await _positionRepository.ClaimSlotAsync(
                            created.Id, claim.SlotId, claim.FriendUserId, claim.FriendName);

                        // Skip AddParticipantAsync for the creator — their row was already inserted above.
                        if (claim.FriendUserId.HasValue && claim.FriendUserId != created.CreatorId)
                        {
                            await _eventRepository.AddParticipantAsync(new EventParticipant
                            {
                                Id = Guid.NewGuid(),
                                EventId = created.Id,
                                UserId = claim.FriendUserId.Value,
                                Status = ParticipationStatus.Registered,
                                JoinedAt = DateTime.UtcNow
                            });
                        }
                    }
                }

                // Load the final state so the caller doesn't need a follow-up GET /positions.
                var finalPositions = await _positionRepository.GetByEventAsync(created.Id);
                initialPositions = finalPositions.Select(MapPositionToDto).ToList();
            }
        }

        return (MapToDto(created, 0, initialPositions), null, StatusCodes.Status201Created);
    }

    public async Task<(JoinEventResponse? Response, string? Error, int StatusCode)> JoinEventAsync(Guid eventId, JoinEventRequest request)
    {
        var exists = await _eventRepository.ExistsAsync(eventId);
        if (!exists)
            return (null, "Event not found", 404);

        var participantCount = await _eventRepository.GetParticipantCountAsync(eventId);
        var ev = await _eventRepository.GetByIdAsync(eventId);

        // Only the host may join directly; everyone else must use the request flow.
        if (request.UserId != ev!.CreatorId)
            return (null, "Use the join-request endpoint to join this event", 403);

        if (participantCount >= ev.MaxPlayers)
            return (null, "Event is full", 409);

        var existing = await _eventRepository.GetParticipantAsync(eventId, request.UserId);
        if (existing is not null)
        {
            if (existing.Status is not (ParticipationStatus.CancelledEarly or ParticipationStatus.CancelledLate))
                return (null, "Already joined", 409);

            // Reinstate a previously cancelled participant (capacity already rechecked above).
            existing.Status = ParticipationStatus.Registered;
            existing.StatusUpdatedAt = DateTime.UtcNow;
            var reinstated = await _eventRepository.UpdateParticipantAsync(existing);
            return (new JoinEventResponse
            {
                EventId = reinstated.EventId,
                UserId = reinstated.UserId,
                Status = reinstated.Status.ToString(),
                JoinedAt = reinstated.JoinedAt
            }, null, 200);
        }

        var participant = new EventParticipant
        {
            Id = Guid.NewGuid(),
            EventId = eventId,
            UserId = request.UserId,
            Status = ParticipationStatus.Registered,
            JoinedAt = DateTime.UtcNow
        };

        var saved = await _eventRepository.AddParticipantAsync(participant);

        var joiner = await _userRepository.GetUserByIdAsync(request.UserId);
        var joinerName = joiner?.DisplayName ?? "Someone";
        await _notificationService.SendPushNotificationToUserAsync(
            ev.CreatorId,
            "New Player Joined!",
            $"{joinerName} joined your event \"{ev.Title}\"",
            "event_join",
            eventId);

        return (new JoinEventResponse
        {
            EventId = saved.EventId,
            UserId = saved.UserId,
            Status = saved.Status.ToString(),
            JoinedAt = saved.JoinedAt
        }, null, 200);
    }

    public async Task<(LeaveEventResponse? Response, string? Error, int StatusCode)> LeaveEventAsync(Guid eventId, LeaveEventRequest request)
    {
        var ev = await _eventRepository.GetByIdAsync(eventId);
        if (ev is null)
            return (null, "Event not found", 404);

        var participant = await _eventRepository.GetParticipantAsync(eventId, request.UserId);
        if (participant is null)
            return (null, "Not a participant", 400);

        if (ev.CreatorId == request.UserId)
            return (null, "Host cannot leave their own event", 400);

        if (ev.ScheduledAt <= DateTime.UtcNow)
            return (null, "Event already started", 400);

        if (participant.Status is ParticipationStatus.CancelledEarly or ParticipationStatus.CancelledLate)
        {
            return (new LeaveEventResponse
            {
                EventId = participant.EventId,
                UserId = participant.UserId,
                Status = participant.Status.ToString(),
                StatusUpdatedAt = participant.StatusUpdatedAt ?? DateTime.UtcNow
            }, null, 200);
        }

        var newStatus = DateTime.UtcNow < ev.ScheduledAt.AddHours(-24)
            ? ParticipationStatus.CancelledEarly
            : ParticipationStatus.CancelledLate;

        participant.Status = newStatus;
        participant.StatusUpdatedAt = DateTime.UtcNow;
        var saved = await _eventRepository.UpdateParticipantAsync(participant);

        return (new LeaveEventResponse
        {
            EventId = saved.EventId,
            UserId = saved.UserId,
            Status = saved.Status.ToString(),
            StatusUpdatedAt = saved.StatusUpdatedAt!.Value
        }, null, 200);
    }

    public async Task<(AttendanceResponse? Response, string? Error, int StatusCode)> ConfirmAttendanceAsync(
        Guid eventId, AttendanceRequest request)
    {
        var ev = await _eventRepository.GetByIdAsync(eventId);
        if (ev is null)
            return (null, "Event not found", 404);

        if (request.HostUserId != ev.CreatorId)
            return (null, "Only the host can confirm attendance", 400);

        if (ev.ScheduledAt > DateTime.UtcNow)
            return (null, "Event has not started yet", 400);

        // Fetch all participant rows; filter to those eligible for outcome assignment.
        var allParticipants = await _eventRepository.GetParticipantsByEventAsync(eventId);
        var eligible = allParticipants
            .Where(p => p.Status is ParticipationStatus.Registered
                            or ParticipationStatus.Attended
                            or ParticipationStatus.NoShow)
            .ToList();

        var eligibleIds = eligible.Select(p => p.UserId).ToHashSet();
        var invalidIds = request.NoShowUserIds.Where(id => !eligibleIds.Contains(id)).ToList();
        if (invalidIds.Count > 0)
            return (null, $"Invalid participant ids: {string.Join(", ", invalidIds)}", 400);

        // Apply outcomes; only stamp StatusUpdatedAt on rows that actually change.
        var noShowSet = request.NoShowUserIds.ToHashSet();
        var now = DateTime.UtcNow;

        foreach (var p in eligible)
        {
            var newStatus = noShowSet.Contains(p.UserId)
                ? ParticipationStatus.NoShow
                : ParticipationStatus.Attended;

            if (p.Status != newStatus)
            {
                p.Status = newStatus;
                p.StatusUpdatedAt = now;
                p.VerificationMethod = AttendanceVerificationMethod.HostManual;
                p.VerifiedByUserId = request.HostUserId;
            }
        }

        await _eventRepository.SaveParticipantChangesAsync();

        return (new AttendanceResponse
        {
            EventId = eventId,
            Attended = eligible.Count(p => p.Status == ParticipationStatus.Attended),
            NoShows = eligible.Count(p => p.Status == ParticipationStatus.NoShow)
        }, null, 200);
    }

    public async Task<(CheckInResponse? Response, string? Error, int StatusCode)> CheckInAsync(
        Guid eventId, CheckInRequest request)
    {
        var ev = await _eventRepository.GetByIdAsync(eventId);
        if (ev is null)
            return (null, "Event not found", 404);

        var participant = await _eventRepository.GetParticipantAsync(eventId, request.UserId);
        if (participant is null)
            return (null, "Not a participant", 404);

        // Idempotent: already attended — return success before any window or distance check.
        if (participant.Status == ParticipationStatus.Attended)
        {
            var idempotentDist = HaversineMeters(request.Latitude, request.Longitude, ev.Latitude, ev.Longitude);
            return (new CheckInResponse
            {
                EventId = eventId,
                UserId = request.UserId,
                Status = participant.Status.ToString(),
                AttendanceStatus = LiveAttendanceStatus.Present,
                VerificationMethod = participant.VerificationMethod,
                StatusUpdatedAt = participant.StatusUpdatedAt ?? participant.JoinedAt,
                DistanceMeters = idempotentDist
            }, null, 200);
        }

        if (participant.Status != ParticipationStatus.Registered)
            return (null, $"Cannot check in with status {participant.Status}", 400);

        var windowOpenMinutes = _attendanceOptions.MinutesBeforeStart > 0
            ? _attendanceOptions.MinutesBeforeStart : 10;
        var windowCloseMinutes = _attendanceOptions.MinutesAfterStart > 0
            ? _attendanceOptions.MinutesAfterStart : 15;
        var radiusMeters = _attendanceOptions.CheckInRadiusMeters > 0
            ? _attendanceOptions.CheckInRadiusMeters : 200.0;

        if (!IsValidCoordinate(request.Latitude, request.Longitude))
            return (null, "Invalid latitude or longitude", 400);

        var now = DateTime.UtcNow;
        var windowOpen  = ev.ScheduledAt.AddMinutes(-windowOpenMinutes);
        var windowClose = ev.ScheduledAt.AddMinutes(windowCloseMinutes);

        if (now < windowOpen || now >= windowClose)
            return (null, "Check-in window is not open", 400);

        var distanceMeters = HaversineMeters(request.Latitude, request.Longitude, ev.Latitude, ev.Longitude);

        // Too far: return a non-null Response carrying distanceMeters so the controller can
        // build the rich rejection payload. Error carries venueName for the same reason.
        if (distanceMeters > radiusMeters)
        {
            return (new CheckInResponse
            {
                EventId = eventId,
                UserId = request.UserId,
                Status = participant.Status.ToString(),
                AttendanceStatus = LiveAttendanceStatus.Pending,
                DistanceMeters = distanceMeters
            }, ev.Venue?.Name ?? ev.Title, 400);
        }

        participant.Status = ParticipationStatus.Attended;
        participant.StatusUpdatedAt = now;
        participant.VerificationMethod = AttendanceVerificationMethod.AutomaticLocation;
        participant.VerifiedByUserId = null;
        participant.DistanceMeters = distanceMeters;
        await _eventRepository.UpdateParticipantAsync(participant);

        var checker = await _userRepository.GetUserByIdAsync(request.UserId);
        if (ev.CreatorId != request.UserId)
        {
            await _notificationService.SendPushNotificationToUserAsync(
                ev.CreatorId,
                "Check-in",
                $"{checker?.DisplayName ?? "A player"} checked in.",
                "attendance_auto",
                eventId);
        }

        return (new CheckInResponse
        {
            EventId = eventId,
            UserId = request.UserId,
            Status = participant.Status.ToString(),
            AttendanceStatus = LiveAttendanceStatus.Present,
            VerificationMethod = AttendanceVerificationMethod.AutomaticLocation,
            StatusUpdatedAt = participant.StatusUpdatedAt!.Value,
            DistanceMeters = distanceMeters
        }, null, 200);
    }

    public async Task<(ParticipantStatusResponse? Response, string? Error, int StatusCode)> GetParticipantStatusAsync(
        Guid eventId, Guid userId)
    {
        var exists = await _eventRepository.ExistsAsync(eventId);
        if (!exists)
            return (null, "Event not found", 404);

        var participant = await _eventRepository.GetParticipantAsync(eventId, userId);
        if (participant is null)
            return (null, "Participant not found", 404);

        return (new ParticipantStatusResponse
        {
            UserId = participant.UserId,
            Status = participant.Status.ToString(),
            StatusUpdatedAt = participant.StatusUpdatedAt
        }, null, 200);
    }

    private static bool IsValidCoordinate(double latitude, double longitude) =>
        latitude is >= -90 and <= 90 &&
        longitude is >= -180 and <= 180 &&
        !(latitude == 0 && longitude == 0);

    private static double HaversineMeters(double lat1, double lon1, double lat2, double lon2)
    {
        const double R = 6_371_000; // Earth radius in metres
        var dLat = (lat2 - lat1) * Math.PI / 180.0;
        var dLon = (lon2 - lon1) * Math.PI / 180.0;
        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2)
              + Math.Cos(lat1 * Math.PI / 180.0) * Math.Cos(lat2 * Math.PI / 180.0)
              * Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
        return R * 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
    }

    private static EventDto MapToDto(
        Event ev,
        int participantCount,
        List<PositionSlotDto>? positions = null,
        string? myStatus = null,
        bool? hasPositions = null,
        int? claimedCount = null,
        int? pendingRequestCount = null,
        string? myRequestStatus = null,
        EventStatusProjection.Snapshot? lifecycle = null,
        int? presentCount = null,
        int? pendingAttendanceCount = null,
        int? absentCount = null)
    {
        decimal? costPerPlayer = null;
        if (ev.TotalCost is > 0 && ev.MaxPlayers > 0)
            costPerPlayer = decimal.Round(ev.TotalCost.Value / ev.MaxPlayers, 2);

        return new EventDto
        {
            Id = ev.Id,
            Title = ev.Title,
            Description = ev.Description,
            CreatorId = ev.CreatorId,
            Latitude = ev.Latitude,
            Longitude = ev.Longitude,
            ScheduledAt = ev.ScheduledAt,
            MaxPlayers = ev.MaxPlayers,
            ParticipantCount = participantCount,
            Sport = ev.Sport,
            SportDetails = ParseJson(ev.SportDetails),
            VenueId = ev.VenueId,
            VenueName = ev.Venue?.Name,
            IsPrivate = ev.IsPrivate,
            TotalCost = ev.TotalCost is > 0 ? ev.TotalCost : null,
            CostPerPlayer = costPerPlayer,
            RequiredSkillLevel = ev.RequiredSkillLevel,
            CreatedAt = ev.CreatedAt,
            Positions = positions,
            MyStatus = myStatus,
            HasPositions = hasPositions,
            ClaimedCount = claimedCount,
            PendingRequestCount = pendingRequestCount,
            MyRequestStatus = myRequestStatus,
            ScheduledEnd = lifecycle?.ScheduledEnd,
            ServerNow = lifecycle?.ServerNow,
            LiveStatus = lifecycle?.Status,
            Status = lifecycle?.Status,
            ElapsedSeconds = lifecycle?.ElapsedSeconds,
            RemainingSeconds = lifecycle?.RemainingSeconds,
            SecondsUntilStart = lifecycle?.SecondsUntilStart,
            PresentCount = presentCount,
            PendingAttendanceCount = pendingAttendanceCount,
            AbsentCount = absentCount,
            ResultSummary = lifecycle?.ResultSummary,
            Permissions = lifecycle?.Permissions
        };
    }

    private static PositionSlotDto MapPositionToDto(EventPosition p) => new()
    {
        SlotId = p.SlotId,
        Team = p.Team,
        Role = p.Role,
        X = p.X,
        Y = p.Y,
        Status = p.Status,
        ClaimedByUserId = p.ClaimedByUserId,
        ClaimedByDisplayName = p.ClaimedByUser?.DisplayName ?? p.ClaimedByName,
        ClaimedAt = p.ClaimedAt
    };

    private static JsonElement? ParseJson(string? json)
    {
        if (string.IsNullOrEmpty(json)) return null;
        try { return JsonSerializer.Deserialize<JsonElement>(json); }
        catch { return null; }
    }
}
