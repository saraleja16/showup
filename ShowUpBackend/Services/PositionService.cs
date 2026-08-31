using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Models.Entities;
using ShowUpBackend.Repositories.Interfaces;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Services;

public class PositionService : IPositionService
{
    private readonly IPositionRepository _positionRepository;
    private readonly IEventRepository _eventRepository;
    private readonly IUserRepository _userRepository;
    private readonly INotificationService _notificationService;
    private readonly IJoinRequestRepository _joinRequestRepository;

    public PositionService(
        IPositionRepository positionRepository,
        IEventRepository eventRepository,
        IUserRepository userRepository,
        INotificationService notificationService,
        IJoinRequestRepository joinRequestRepository)
    {
        _positionRepository = positionRepository;
        _eventRepository = eventRepository;
        _userRepository = userRepository;
        _notificationService = notificationService;
        _joinRequestRepository = joinRequestRepository;
    }

    public async Task<(List<PositionSlotDto>? Slots, string? Error, int StatusCode)> GetEventPositionsAsync(
        Guid eventId, Guid? callerId = null)
    {
        var exists = await _eventRepository.ExistsAsync(eventId);
        if (!exists)
            return (null, "Event not found", 404);

        var positions = await _positionRepository.GetByEventAsync(eventId);

        // When callerId is absent, behaviour is byte-identical to today.
        if (callerId is null)
            return (positions.Select(MapToDto).ToList(), null, 200);

        // Two bulk queries for the caller-aware fields — one round-trip each.
        var pendingCountsBySlot  = await _joinRequestRepository.GetPendingCountsBySlotAsync(eventId);
        var myPendingBySlot      = await _joinRequestRepository.GetPendingSlotIdsByRequesterAsync(eventId, callerId.Value);

        var slots = positions.Select(p =>
        {
            var dto = MapToDto(p);
            dto.PendingRequestCount = pendingCountsBySlot.TryGetValue(p.SlotId, out var cnt) ? cnt : 0;
            if (myPendingBySlot.TryGetValue(p.SlotId, out var reqId))
            {
                dto.IsMyPendingRequest = true;
                dto.RequestId          = reqId;
            }
            else
            {
                dto.IsMyPendingRequest = false;
            }
            return dto;
        }).ToList();

        return (slots, null, 200);
    }

    public async Task<(PositionSlotDto? Slot, string? Error, int StatusCode)> ClaimAsync(
        Guid eventId, string slotId, ClaimPositionRequest request)
    {
        var ev = await _eventRepository.GetByIdAsync(eventId);
        if (ev is null)
            return (null, "Event not found", 404);

        var slot = await _positionRepository.GetSlotAsync(eventId, slotId);
        if (slot is null)
            return (null, "Position slot not found", 404);

        var isSelfClaim = string.IsNullOrWhiteSpace(request.FriendName);

        if (isSelfClaim)
        {
            // Only the host may claim a slot directly; everyone else must use the request flow.
            if (request.CallerId != ev.CreatorId)
                return (null, "Use the join-request endpoint to join this event", 403);

            // Self-claim: check the caller doesn't already hold a slot in this event.
            var alreadyHasSlot = await _positionRepository.UserHasClaimedSlotAsync(eventId, request.CallerId);
            if (alreadyHasSlot)
                return (null, "You already hold a position in this event", 409);
        }
        else
        {
            // Organizer pre-claim: only the event creator may do this.
            if (request.CallerId != ev.CreatorId)
                return (null, "Only the event organizer can pre-claim a slot for a friend", 403);
        }

        // Determine who ends up on the slot.
        Guid? claimedByUserId = isSelfClaim ? request.CallerId : request.FriendUserId;
        string? claimedByName = isSelfClaim ? null : request.FriendName;

        // Validate the user ID before touching the DB.
        if (claimedByUserId.HasValue)
        {
            if (claimedByUserId.Value == Guid.Empty)
                return (null, "callerId is required", 400);

            var user = await _userRepository.GetUserByIdAsync(claimedByUserId.Value);
            if (user is null)
                return (null, "User not found", 404);
        }

        // Atomic conditional update — 0 rows means the slot was taken in a race.
        var rowsAffected = await _positionRepository.ClaimSlotAsync(eventId, slotId, claimedByUserId, claimedByName);
        if (rowsAffected == 0)
            return (null, "Slot is no longer available", 409);

        // If a real user id is on the slot, upsert their EventParticipant row and notify organizer.
        if (claimedByUserId.HasValue)
        {
            await UpsertParticipantAsync(eventId, claimedByUserId.Value);

            var joiner = await _userRepository.GetUserByIdAsync(claimedByUserId.Value);
            var joinerName = joiner?.DisplayName ?? "Someone";
            await _notificationService.SendPushNotificationToUserAsync(
                ev.CreatorId,
                "New Player Joined!",
                $"{joinerName} claimed a position in \"{ev.Title}\"",
                "event_join",
                eventId);
        }

        var updated = await _positionRepository.GetSlotAsync(eventId, slotId);
        return (MapToDto(updated!), null, 200);
    }

    public async Task<(PositionSlotDto? Slot, string? Error, int StatusCode)> ReleaseAsync(
        Guid eventId, string slotId, ReleasePositionRequest request)
    {
        var ev = await _eventRepository.GetByIdAsync(eventId);
        if (ev is null)
            return (null, "Event not found", 404);

        var slot = await _positionRepository.GetSlotAsync(eventId, slotId);
        if (slot is null)
            return (null, "Position slot not found", 404);

        // Only the organizer or the claimant may release.
        var isOrganizer = request.CallerId == ev.CreatorId;
        var isClaimant = slot.ClaimedByUserId.HasValue && slot.ClaimedByUserId == request.CallerId;
        if (!isOrganizer && !isClaimant)
            return (null, "You are not authorized to release this slot", 403);

        var userIdBeforeRelease = slot.ClaimedByUserId;

        // Atomic conditional update.
        var rowsAffected = await _positionRepository.ReleaseSlotAsync(eventId, slotId);
        if (rowsAffected == 0)
            return (null, "Slot is already open", 409);

        // If a real user was on the slot, update their EventParticipant to CancelledEarly.
        if (userIdBeforeRelease.HasValue)
        {
            var participant = await _eventRepository.GetParticipantAsync(eventId, userIdBeforeRelease.Value);
            if (participant is not null &&
                participant.Status is not (ParticipationStatus.CancelledEarly or ParticipationStatus.CancelledLate))
            {
                participant.Status = ParticipationStatus.CancelledEarly;
                participant.StatusUpdatedAt = DateTime.UtcNow;
                await _eventRepository.UpdateParticipantAsync(participant);
            }
        }

        var updated = await _positionRepository.GetSlotAsync(eventId, slotId);
        return (MapToDto(updated!), null, 200);
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private async Task UpsertParticipantAsync(Guid eventId, Guid userId)
    {
        var existing = await _eventRepository.GetParticipantAsync(eventId, userId);
        if (existing is not null)
        {
            if (existing.Status is ParticipationStatus.CancelledEarly or ParticipationStatus.CancelledLate)
            {
                existing.Status = ParticipationStatus.Registered;
                existing.StatusUpdatedAt = DateTime.UtcNow;
                await _eventRepository.UpdateParticipantAsync(existing);
            }
            // Already active — nothing to do.
            return;
        }

        var participant = new EventParticipant
        {
            Id = Guid.NewGuid(),
            EventId = eventId,
            UserId = userId,
            Status = ParticipationStatus.Registered,
            JoinedAt = DateTime.UtcNow
        };
        await _eventRepository.AddParticipantAsync(participant);
    }

    private static PositionSlotDto MapToDto(EventPosition p) => new()
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
}
