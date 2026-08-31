using Microsoft.EntityFrameworkCore;
using ShowUpBackend.Data;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Models.Entities;
using ShowUpBackend.Repositories.Interfaces;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Services;

public class EventInvitationService : IEventInvitationService
{
    private readonly AppDbContext _context;
    private readonly IEventRepository _eventRepository;
    private readonly IPositionRepository _positionRepository;
    private readonly INotificationService _notificationService;

    public EventInvitationService(
        AppDbContext context,
        IEventRepository eventRepository,
        IPositionRepository positionRepository,
        INotificationService notificationService)
    {
        _context = context;
        _eventRepository = eventRepository;
        _positionRepository = positionRepository;
        _notificationService = notificationService;
    }

    public async Task<(EventInvitationDto? Invitation, string? Error, int StatusCode)> CreateAsync(
        Guid eventId, Guid inviterId, CreateEventInvitationRequest request, CancellationToken cancellationToken = default)
    {
        if (request.InviteeId == inviterId)
            return (null, "You cannot invite yourself", StatusCodes.Status400BadRequest);

        var ev = await _eventRepository.GetByIdAsync(eventId);
        if (ev is null)
            return (null, "Event not found", StatusCodes.Status404NotFound);

        if (ev.CreatorId != inviterId)
            return (null, "Only the event host can send invitations", StatusCodes.Status403Forbidden);

        if (DateTime.UtcNow >= ev.ScheduledAt.AddMinutes(-10))
            return (null, "Invitations are closed for this event", StatusCodes.Status400BadRequest);

        var (a, b) = Connection.CanonicalPair(inviterId, request.InviteeId);
        var isMatched = await _context.Connections.AsNoTracking()
            .AnyAsync(c => c.UserAId == a && c.UserBId == b, cancellationToken);
        if (!isMatched)
            return (null, "You can only invite users you've matched with", StatusCodes.Status403Forbidden);

        var existingParticipant = await _eventRepository.GetParticipantAsync(eventId, request.InviteeId);
        if (existingParticipant is not null &&
            existingParticipant.Status is ParticipationStatus.Registered or ParticipationStatus.Attended)
            return (null, "This player is already in the event", StatusCodes.Status409Conflict);

        var existingInvite = await _context.EventInvitations.AsNoTracking()
            .AnyAsync(i => i.EventId == eventId && i.InviteeId == request.InviteeId && i.Status == "Pending", cancellationToken);
        if (existingInvite)
            return (null, "An invitation is already pending for this player", StatusCodes.Status409Conflict);

        if (request.SlotId is not null)
        {
            var slot = await _positionRepository.GetSlotAsync(eventId, request.SlotId);
            if (slot is null)
                return (null, "Slot not found", StatusCodes.Status404NotFound);
            if (slot.Status != "open")
                return (null, "Slot is already taken", StatusCodes.Status409Conflict);
        }

        var invitation = new EventInvitation
        {
            Id = Guid.NewGuid(),
            EventId = eventId,
            SlotId = request.SlotId,
            InviterId = inviterId,
            InviteeId = request.InviteeId,
            Status = "Pending",
            CreatedAt = DateTime.UtcNow
        };
        _context.EventInvitations.Add(invitation);
        await _context.SaveChangesAsync(cancellationToken);

        var inviter = await _context.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == inviterId, cancellationToken);
        await _notificationService.SendPushNotificationToUserAsync(
            request.InviteeId,
            "Event invitation",
            $"{inviter?.DisplayName ?? "Someone"} invited you to \"{ev.Title}\"",
            "event_invite",
            eventId,
            data: new { eventId, invitationId = invitation.Id });

        return (await MapToDtoAsync(invitation, ev, inviter?.DisplayName, cancellationToken), null, StatusCodes.Status201Created);
    }

    public async Task<(EventInvitationDto? Invitation, string? Error, int StatusCode)> AcceptAsync(
        Guid eventId, Guid invitationId, Guid inviteeId, CancellationToken cancellationToken = default)
    {
        var invitation = await _context.EventInvitations
            .FirstOrDefaultAsync(i => i.Id == invitationId && i.EventId == eventId, cancellationToken);
        if (invitation is null)
            return (null, "Invitation not found", StatusCodes.Status404NotFound);
        if (invitation.InviteeId != inviteeId)
            return (null, "This invitation is not addressed to you", StatusCodes.Status403Forbidden);
        if (invitation.Status != "Pending")
            return (null, "This invitation is no longer pending", StatusCodes.Status409Conflict);

        var ev = await _eventRepository.GetByIdAsync(eventId);
        if (ev is null)
            return (null, "Event not found", StatusCodes.Status404NotFound);

        // Try to claim the specific slot first (if any); fall back to a plain participant
        // row when the slot was taken in the meantime — the invite is still honoured as
        // long as the event has room.
        var slotId = invitation.SlotId;
        if (slotId is not null)
        {
            var rows = await _positionRepository.ClaimSlotAsync(eventId, slotId, inviteeId, null);
            if (rows == 0) slotId = null; // race — slot no longer open, fall through to capacity check
        }

        if (slotId is null)
        {
            var participantCount = await _eventRepository.GetParticipantCountAsync(eventId);
            if (participantCount >= ev.MaxPlayers)
                return (null, "This event is full", StatusCodes.Status409Conflict);
        }

        await UpsertParticipantAsync(eventId, inviteeId);

        invitation.Status = "Accepted";
        invitation.ResolvedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync(cancellationToken);

        var invitee = await _context.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == inviteeId, cancellationToken);
        await _notificationService.SendPushNotificationToUserAsync(
            invitation.InviterId,
            "Invitation accepted",
            $"{invitee?.DisplayName ?? "Your friend"} joined \"{ev.Title}\"",
            "event_invite_accepted",
            eventId,
            data: new { eventId });

        return (await MapToDtoAsync(invitation, ev, null, cancellationToken), null, StatusCodes.Status200OK);
    }

    public async Task<(EventInvitationDto? Invitation, string? Error, int StatusCode)> DeclineAsync(
        Guid eventId, Guid invitationId, Guid inviteeId, CancellationToken cancellationToken = default)
    {
        var invitation = await _context.EventInvitations
            .FirstOrDefaultAsync(i => i.Id == invitationId && i.EventId == eventId, cancellationToken);
        if (invitation is null)
            return (null, "Invitation not found", StatusCodes.Status404NotFound);
        if (invitation.InviteeId != inviteeId)
            return (null, "This invitation is not addressed to you", StatusCodes.Status403Forbidden);
        if (invitation.Status != "Pending")
            return (null, "This invitation is no longer pending", StatusCodes.Status409Conflict);

        invitation.Status = "Declined";
        invitation.ResolvedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync(cancellationToken);

        var ev = await _eventRepository.GetByIdAsync(eventId);
        var invitee = await _context.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == inviteeId, cancellationToken);
        if (ev is not null)
        {
            await _notificationService.SendPushNotificationToUserAsync(
                invitation.InviterId,
                "Invitation declined",
                $"{invitee?.DisplayName ?? "Your friend"} can't make it to \"{ev.Title}\"",
                "event_invite_declined",
                eventId,
                data: new { eventId });
        }

        return (await MapToDtoAsync(invitation, ev, null, cancellationToken), null, StatusCodes.Status200OK);
    }

    public async Task<(List<EventInvitationDto>? Invitations, string? Error, int StatusCode)> GetPendingForUserAsync(
        Guid userId, CancellationToken cancellationToken = default)
    {
        var invitations = await _context.EventInvitations.AsNoTracking()
            .Where(i => i.InviteeId == userId && i.Status == "Pending")
            .OrderBy(i => i.CreatedAt)
            .ToListAsync(cancellationToken);

        if (invitations.Count == 0)
            return ([], null, StatusCodes.Status200OK);

        var eventIds = invitations.Select(i => i.EventId).Distinct().ToList();
        var events = await _context.Events.AsNoTracking()
            .Include(e => e.Venue)
            .Where(e => eventIds.Contains(e.Id))
            .ToDictionaryAsync(e => e.Id, cancellationToken);

        var inviterIds = invitations.Select(i => i.InviterId).Distinct().ToList();
        var inviters = await _context.Users.AsNoTracking()
            .Where(u => inviterIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.DisplayName, cancellationToken);

        var slotKeys = invitations.Where(i => i.SlotId is not null).Select(i => (i.EventId, i.SlotId!)).Distinct().ToList();
        var slotRoles = new Dictionary<(Guid, string), string>();
        if (slotKeys.Count > 0)
        {
            var slotEventIds = slotKeys.Select(k => k.Item1).Distinct().ToList();
            var positions = await _context.EventPositions.AsNoTracking()
                .Where(p => slotEventIds.Contains(p.EventId))
                .ToListAsync(cancellationToken);
            foreach (var p in positions)
                slotRoles[(p.EventId, p.SlotId)] = p.Role;
        }

        var result = invitations.Select(i =>
        {
            events.TryGetValue(i.EventId, out var ev);
            inviters.TryGetValue(i.InviterId, out var inviterName);
            string? slotRole = i.SlotId is not null && slotRoles.TryGetValue((i.EventId, i.SlotId), out var role)
                ? role : null;

            return new EventInvitationDto
            {
                InvitationId = i.Id,
                EventId = i.EventId,
                EventTitle = ev?.Title ?? "Event",
                Sport = ev?.Sport ?? "",
                ScheduledAt = ev?.ScheduledAt ?? default,
                VenueName = ev?.Venue?.Name,
                SlotId = i.SlotId,
                SlotRole = slotRole,
                InviterId = i.InviterId,
                InviterDisplayName = inviterName ?? "Someone",
                Status = i.Status,
                CreatedAt = i.CreatedAt
            };
        }).ToList();

        return (result, null, StatusCodes.Status200OK);
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
            return;
        }

        await _eventRepository.AddParticipantAsync(new EventParticipant
        {
            Id = Guid.NewGuid(),
            EventId = eventId,
            UserId = userId,
            Status = ParticipationStatus.Registered,
            JoinedAt = DateTime.UtcNow
        });
    }

    private async Task<EventInvitationDto> MapToDtoAsync(
        EventInvitation i, Event? ev, string? inviterDisplayName, CancellationToken cancellationToken)
    {
        string? slotRole = null;
        if (i.SlotId is not null)
        {
            var slot = await _positionRepository.GetSlotAsync(i.EventId, i.SlotId);
            slotRole = slot?.Role;
        }

        if (inviterDisplayName is null)
        {
            inviterDisplayName = await _context.Users.AsNoTracking()
                .Where(u => u.Id == i.InviterId)
                .Select(u => u.DisplayName)
                .FirstOrDefaultAsync(cancellationToken) ?? "Someone";
        }

        return new EventInvitationDto
        {
            InvitationId = i.Id,
            EventId = i.EventId,
            EventTitle = ev?.Title ?? "Event",
            Sport = ev?.Sport ?? "",
            ScheduledAt = ev?.ScheduledAt ?? default,
            VenueName = ev?.Venue?.Name,
            SlotId = i.SlotId,
            SlotRole = slotRole,
            InviterId = i.InviterId,
            InviterDisplayName = inviterDisplayName,
            Status = i.Status,
            CreatedAt = i.CreatedAt
        };
    }
}
