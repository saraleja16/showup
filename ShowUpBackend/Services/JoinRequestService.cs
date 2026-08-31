using Microsoft.EntityFrameworkCore;
using ShowUpBackend.Data;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Models.Entities;
using ShowUpBackend.Repositories.Interfaces;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Services;

public class JoinRequestService : IJoinRequestService
{
    private readonly AppDbContext _context;
    private readonly IJoinRequestRepository _requestRepository;
    private readonly IEventRepository _eventRepository;
    private readonly IPositionRepository _positionRepository;
    private readonly IReliabilityService _reliabilityService;
    private readonly INotificationService _notificationService;

    public JoinRequestService(
        AppDbContext context,
        IJoinRequestRepository requestRepository,
        IEventRepository eventRepository,
        IPositionRepository positionRepository,
        IReliabilityService reliabilityService,
        INotificationService notificationService)
    {
        _context = context;
        _requestRepository = requestRepository;
        _eventRepository = eventRepository;
        _positionRepository = positionRepository;
        _reliabilityService = reliabilityService;
        _notificationService = notificationService;
    }

    // ── POST /api/events/{eventId}/requests ───────────────────────────────────

    public async Task<(JoinRequestResponse? Response, string? Error, int StatusCode)> CreateAsync(
        Guid eventId, CreateJoinRequestRequest request)
    {
        var ev = await _eventRepository.GetByIdAsync(eventId);
        if (ev is null)
            return (null, "Event not found", 404);

        // Host cannot request to join their own event.
        if (request.RequesterId == ev.CreatorId)
            return (null, "You are the host of this event", 400);

        // Private events only accept join requests from users matched with the host.
        if (ev.IsPrivate)
        {
            var isMatched = await _context.Connections.AsNoTracking().AnyAsync(c =>
                (c.UserAId == ev.CreatorId && c.UserBId == request.RequesterId) ||
                (c.UserAId == request.RequesterId && c.UserBId == ev.CreatorId));
            if (!isMatched)
                return (null, "This event is private. Match with the host to request to join.", 403);
        }

        // Reject if the window has closed (T-10).
        var now = DateTime.UtcNow;
        if (now >= ev.ScheduledAt.AddMinutes(-10))
            return (null, "Join requests are closed for this event", 400);

        // Reject if caller already has an active participant row.
        var participant = await _eventRepository.GetParticipantAsync(eventId, request.RequesterId);
        if (participant is not null &&
            participant.Status is ParticipationStatus.Registered or ParticipationStatus.Attended)
            return (null, "You are already a participant in this event", 409);

        // Reject duplicate pending request on this event (any slot).
        var existing = await _requestRepository.GetPendingByRequesterAsync(eventId, request.RequesterId);
        if (existing is not null)
            return (null, "You already have a pending request for this event", 409);

        // If a slotId is given, verify the slot is currently open.
        if (request.SlotId is not null)
        {
            var slot = await _positionRepository.GetSlotAsync(eventId, request.SlotId);
            if (slot is null)
                return (null, "Slot not found", 404);
            if (slot.Status != "open")
                return (null, "Slot is already taken", 409);
        }

        var joinRequest = new EventJoinRequest
        {
            Id = Guid.NewGuid(),
            EventId = eventId,
            SlotId = request.SlotId,
            RequesterId = request.RequesterId,
            Status = "Pending",
            CreatedAt = now
        };

        var saved = await _requestRepository.CreateAsync(joinRequest);

        // Notify host.
        var requester = await _context.Users.FindAsync(request.RequesterId);
        var requesterName = requester?.DisplayName ?? "Someone";
        await _notificationService.SendPushNotificationToUserAsync(
            ev.CreatorId,
            "New Join Request",
            $"{requesterName} wants to join \"{ev.Title}\"",
            "request_received",
            eventId,
            data: new { eventId });

        return (MapToResponse(saved), null, 201);
    }

    // ── POST /api/events/{eventId}/requests/{requestId}/withdraw ─────────────

    public async Task<(JoinRequestResponse? Response, string? Error, int StatusCode)> WithdrawAsync(
        Guid eventId, Guid requestId, WithdrawJoinRequestRequest request)
    {
        var joinRequest = await _requestRepository.GetByIdAsync(requestId);
        if (joinRequest is null || joinRequest.EventId != eventId)
            return (null, "Request not found", 404);

        if (joinRequest.RequesterId != request.CallerId)
            return (null, "You are not the requester", 403);

        if (joinRequest.Status != "Pending")
            return (null, "Request is no longer pending", 409);

        joinRequest.Status = "Withdrawn";
        joinRequest.ResolvedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return (MapToResponse(joinRequest), null, 200);
    }

    // ── POST /api/events/{eventId}/requests/{requestId}/accept ───────────────

    public async Task<(JoinRequestResponse? Response, string? Error, int StatusCode)> AcceptAsync(
        Guid eventId, Guid requestId, AcceptJoinRequestRequest request)
    {
        // Load request with event navigation — fail fast before opening a transaction.
        var joinRequest = await _requestRepository.GetByIdAsync(requestId);
        if (joinRequest is null || joinRequest.EventId != eventId)
            return (null, "Request not found", 404);

        if (request.CallerId != joinRequest.Event.CreatorId)
            return (null, "Only the host can accept requests", 403);

        var slotId = joinRequest.SlotId;
        var eventTitle = joinRequest.Event.Title;

        // autoDeclinedIds is populated inside the strategy delegate and read outside for
        // notifications. It is declared here so the post-tx notification block can access it.
        List<Guid> autoDeclinedIds = [];
        string? txError = null;
        int txStatus = 200;

        var strategy = _context.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            // Re-initialise on every attempt so a retry doesn't double-accumulate ids.
            autoDeclinedIds = [];
            txError = null;
            txStatus = 200;

            await using var tx = await _context.Database.BeginTransactionAsync();

            var now = DateTime.UtcNow;

            // Atomically mark as Accepted — returns 0 if already resolved by a race.
            var accepted = await _context.EventJoinRequests
                .Where(r => r.Id == requestId && r.Status == "Pending")
                .ExecuteUpdateAsync(s => s
                    .SetProperty(r => r.Status, "Accepted")
                    .SetProperty(r => r.ResolvedAt, now)
                    .SetProperty(r => r.ResolvedBy, request.CallerId));
            if (accepted == 0)
            {
                await tx.RollbackAsync();
                txError = "Request is no longer pending";
                txStatus = 409;
                return;
            }

            // Capacity seatbelt.
            if (slotId is not null)
            {
                var claimed = await _context.EventPositions
                    .CountAsync(p => p.EventId == eventId && p.Status == "claimed");
                if (claimed >= joinRequest.Event.MaxPlayers)
                {
                    await tx.RollbackAsync();
                    txError = "Event is full";
                    txStatus = 409;
                    return;
                }

                // Claim the slot atomically.
                var rows = await _positionRepository.ClaimSlotAsync(
                    eventId, slotId, joinRequest.RequesterId, null);
                if (rows == 0)
                {
                    await tx.RollbackAsync();
                    txError = "Slot is no longer available";
                    txStatus = 409;
                    return;
                }
            }
            else
            {
                // Legacy event (no position rows) — fall back to participant count.
                var participantCount = await _eventRepository.GetParticipantCountAsync(eventId);
                if (participantCount >= joinRequest.Event.MaxPlayers)
                {
                    await tx.RollbackAsync();
                    txError = "Event is full";
                    txStatus = 409;
                    return;
                }
            }

            // Upsert participant row.
            await UpsertParticipantAsync(eventId, joinRequest.RequesterId);

            // Auto-decline other Pending requests on the same slot.
            if (slotId is not null)
            {
                var competingRequesters = await _context.EventJoinRequests
                    .Where(r => r.EventId == eventId && r.SlotId == slotId &&
                                r.Status == "Pending" && r.Id != requestId)
                    .Select(r => r.RequesterId)
                    .ToListAsync();
                autoDeclinedIds.AddRange(competingRequesters);

                if (competingRequesters.Count > 0)
                {
                    await _context.EventJoinRequests
                        .Where(r => r.EventId == eventId && r.SlotId == slotId &&
                                    r.Status == "Pending" && r.Id != requestId)
                        .ExecuteUpdateAsync(s => s
                            .SetProperty(r => r.Status, "Declined")
                            .SetProperty(r => r.ResolvedAt, now));
                }
            }

            // If accepting filled the last open slot / seat, auto-decline all remaining Pending.
            bool eventNowFull;
            if (slotId is not null)
            {
                var openSlots = await _context.EventPositions
                    .CountAsync(p => p.EventId == eventId && p.Status == "open");
                eventNowFull = openSlots == 0;
            }
            else
            {
                var newParticipantCount = await _eventRepository.GetParticipantCountAsync(eventId);
                eventNowFull = newParticipantCount >= joinRequest.Event.MaxPlayers;
            }

            if (eventNowFull)
            {
                var remainingRequesters = await _context.EventJoinRequests
                    .Where(r => r.EventId == eventId && r.Status == "Pending")
                    .Select(r => r.RequesterId)
                    .ToListAsync();
                autoDeclinedIds.AddRange(remainingRequesters);

                if (remainingRequesters.Count > 0)
                {
                    await _context.EventJoinRequests
                        .Where(r => r.EventId == eventId && r.Status == "Pending")
                        .ExecuteUpdateAsync(s => s
                            .SetProperty(r => r.Status, "Declined")
                            .SetProperty(r => r.ResolvedAt, now));
                }
            }

            await tx.CommitAsync();
        });

        // ── Return early if the transaction set an error ──────────────────────
        if (txError is not null)
            return (null, txError, txStatus);

        // ── Notifications (outside the strategy delegate) ─────────────────────
        await _notificationService.SendPushNotificationToUserAsync(
            joinRequest.RequesterId,
            "Request Accepted!",
            $"You've been accepted to join \"{eventTitle}\"",
            "request_accepted",
            eventId,
            data: new { eventId });

        foreach (var userId in autoDeclinedIds.Distinct())
        {
            await _notificationService.SendPushNotificationToUserAsync(
                userId,
                "Request Declined",
                $"Your request to join \"{eventTitle}\" could not be filled",
                "request_expired",
                eventId,
                data: new { eventId });
        }

        // Reflect the committed state without a round-trip reload.
        joinRequest.Status = "Accepted";
        joinRequest.ResolvedAt = DateTime.UtcNow;
        joinRequest.ResolvedBy = request.CallerId;
        return (MapToResponse(joinRequest), null, 200);
    }

    // ── POST /api/events/{eventId}/requests/{requestId}/decline ──────────────

    public async Task<(JoinRequestResponse? Response, string? Error, int StatusCode)> DeclineAsync(
        Guid eventId, Guid requestId, DeclineJoinRequestRequest request)
    {
        var joinRequest = await _requestRepository.GetByIdAsync(requestId);
        if (joinRequest is null || joinRequest.EventId != eventId)
            return (null, "Request not found", 404);

        if (request.CallerId != joinRequest.Event.CreatorId)
            return (null, "Only the host can decline requests", 403);

        if (joinRequest.Status != "Pending")
            return (null, "Request is no longer pending", 409);

        var now = DateTime.UtcNow;
        joinRequest.Status = "Declined";
        joinRequest.ResolvedAt = now;
        joinRequest.ResolvedBy = request.CallerId;
        await _context.SaveChangesAsync();

        await _notificationService.SendPushNotificationToUserAsync(
            joinRequest.RequesterId,
            "Request Declined",
            $"Your request to join \"{joinRequest.Event.Title}\" was declined",
            "request_declined",
            eventId,
            data: new { eventId });

        return (MapToResponse(joinRequest), null, 200);
    }

    // ── GET /api/events/{eventId}/requests?callerId= ─────────────────────────

    public async Task<(List<JoinRequestSlotGroupDto>? Groups, string? Error, int StatusCode)> GetByEventAsync(
        Guid eventId, Guid callerId)
    {
        var ev = await _eventRepository.GetByIdAsync(eventId);
        if (ev is null)
            return (null, "Event not found", 404);

        if (callerId != ev.CreatorId)
            return (null, "Only the host can view requests", 403);

        var pending = await _requestRepository.GetPendingByEventAsync(eventId);
        if (pending.Count == 0)
            return ([], null, 200);

        // Batch reliability scores — one DB round-trip for all requesters.
        var requesterIds = pending.Select(r => r.RequesterId).Distinct().ToList();
        var scores = await _reliabilityService.GetScoresAsync(requesterIds);

        // Which requesters have a prior Declined row on this event?
        var previouslyDeclinedSet = await _context.EventJoinRequests
            .Where(r => r.EventId == eventId && r.Status == "Declined" &&
                        requesterIds.Contains(r.RequesterId))
            .Select(r => r.RequesterId)
            .Distinct()
            .ToListAsync();
        var declinedSet = previouslyDeclinedSet.ToHashSet();

        // Slot metadata from EventPositions for each distinct slotId.
        var slotIds = pending
            .Where(r => r.SlotId is not null)
            .Select(r => r.SlotId!)
            .Distinct()
            .ToList();

        Dictionary<string, (string Team, string Role)> slotMeta = [];
        if (slotIds.Count > 0)
        {
            slotMeta = await _context.EventPositions
                .Where(p => p.EventId == eventId && slotIds.Contains(p.SlotId))
                .ToDictionaryAsync(p => p.SlotId, p => (p.Team, p.Role));
        }

        // Group by SlotId (null = legacy event, one group).
        var groups = pending
            .GroupBy(r => r.SlotId)
            .Select(g =>
            {
                string? team = null;
                string? role = null;
                if (g.Key is not null && slotMeta.TryGetValue(g.Key, out var meta))
                {
                    team = meta.Team;
                    role = meta.Role;
                }

                return new JoinRequestSlotGroupDto
                {
                    SlotId = g.Key,
                    Team = team,
                    Role = role,
                    Requests = g.Select(r => new JoinRequestItemDto
                    {
                        RequestId = r.Id,
                        RequesterId = r.RequesterId,
                        DisplayName = r.Requester.DisplayName,
                        AvatarUrl = r.Requester.AvatarUrl,
                        ReliabilityTier = scores.TryGetValue(r.RequesterId, out var s) ? ReliabilityCalculator.TierForScore(s) : "excellent",
                        RequestedAt = r.CreatedAt,
                        PreviouslyDeclined = declinedSet.Contains(r.RequesterId)
                    }).ToList()
                };
            })
            .ToList();

        return (groups, null, 200);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /// <summary>
    /// Mirrors PositionService.UpsertParticipantAsync exactly.
    /// Creates a Registered participant row, or reinstates a previously cancelled one.
    /// </summary>
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

    private static JoinRequestResponse MapToResponse(EventJoinRequest r) => new()
    {
        RequestId = r.Id,
        EventId = r.EventId,
        RequesterId = r.RequesterId,
        SlotId = r.SlotId,
        Status = r.Status,
        CreatedAt = r.CreatedAt,
        ResolvedAt = r.ResolvedAt
    };
}
