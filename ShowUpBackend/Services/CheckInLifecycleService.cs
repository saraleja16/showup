using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ShowUpBackend.Configuration;
using ShowUpBackend.Data;
using ShowUpBackend.Models.Entities;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Services;

public class CheckInLifecycleService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<CheckInLifecycleService> _logger;

    public CheckInLifecycleService(
        IServiceScopeFactory scopeFactory,
        IConfiguration configuration,
        ILogger<CheckInLifecycleService> logger)
    {
        _scopeFactory = scopeFactory;
        _configuration = configuration;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await TickAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "CheckInLifecycleService tick failed");
            }

            await Task.Delay(TimeSpan.FromSeconds(60), stoppingToken);
        }
    }

    private async Task TickAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var attendance = scope.ServiceProvider.GetService<IOptions<AttendanceOptions>>()?.Value
            ?? new AttendanceOptions();
        var windowOpenMinutes = attendance.MinutesBeforeStart > 0
            ? attendance.MinutesBeforeStart
            : int.Parse(_configuration["CheckIn:WindowOpenMinutes"] ?? "10");
        var windowCloseMinutes = attendance.MinutesAfterStart > 0
            ? attendance.MinutesAfterStart
            : int.Parse(_configuration["CheckIn:WindowCloseMinutes"] ?? "15");

        var db     = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var notif  = scope.ServiceProvider.GetRequiredService<INotificationService>();

        var now = DateTime.UtcNow;

        // ── Job 1: Reminder at T−WindowOpen ─────────────────────────────────────
        // Send to all Registered participants of events whose check-in window is
        // currently open but whose reminder has not been sent yet.
        var eventsNeedingReminder = await db.Events
            .Include(e => e.Venue)
            .Where(e =>
                e.ReminderSentAt == null &&
                e.ScheduledAt.AddMinutes(-windowOpenMinutes) <= now &&
                now < e.ScheduledAt.AddMinutes(windowCloseMinutes))
            .ToListAsync();

        foreach (var ev in eventsNeedingReminder)
        {
            var participants = await db.EventParticipants
                .Where(ep => ep.EventId == ev.Id && ep.Status == ParticipationStatus.Registered)
                .ToListAsync();

            var venueName = ev.Venue?.Name ?? ev.Title;

            foreach (var p in participants)
            {
                await notif.SendPushNotificationToUserAsync(
                    userId: p.UserId,
                    title: "Time to check in!",
                    body: $"Your {ev.Sport} game at {venueName} starts soon — check in now",
                    type: "checkin_reminder",
                    eventId: ev.Id,
                    data: new { eventId = ev.Id });
            }

            ev.ReminderSentAt = now;
            _logger.LogInformation(
                "CheckIn reminder sent for event {EventId} ({Title}) to {Count} participant(s)",
                ev.Id, ev.Title, participants.Count);

            // Expire all Pending join requests at T−10 (normal path).
            await ExpirePendingRequestsAsync(db, notif, ev.Id, ev.Title, now);
        }

        await db.SaveChangesAsync();

        // ── Job 2: Finalization at T+WindowClose ─────────────────────────────────
        // Flip every still-Registered participant to NoShow for events past T+15.
        var eventsNeedingFinalization = await db.Events
            .Where(e =>
                e.FinalizedAt == null &&
                e.ScheduledAt.AddMinutes(windowCloseMinutes) <= now)
            .ToListAsync();

        foreach (var ev in eventsNeedingFinalization)
        {
            var registered = await db.EventParticipants
                .Where(ep => ep.EventId == ev.Id && ep.Status == ParticipationStatus.Registered)
                .ToListAsync();

            foreach (var p in registered)
            {
                p.Status = ParticipationStatus.NoShow;
                p.StatusUpdatedAt = now;
            }

            ev.FinalizedAt = now;
            _logger.LogInformation(
                "Event {EventId} ({Title}) finalized: {Count} participant(s) marked NoShow",
                ev.Id, ev.Title, registered.Count);

            // Expire all Pending join requests at T+15 (backstop: fires if the server
            // was down across the T−10 window and the reminder job never ran).
            await ExpirePendingRequestsAsync(db, notif, ev.Id, ev.Title, now);
        }

        await db.SaveChangesAsync();

        // ── Job 3: Prompt scored-match participants to add a result after end ────
        var candidates = await db.Events
            .Where(e => e.ResultPromptSentAt == null && e.ScheduledAt <= now)
            .ToListAsync();

        foreach (var ev in candidates)
        {
            if (!EventLifecycleCalculator.IsScoredMatch(ev))
                continue;

            var end = EventLifecycleCalculator.GetScheduledEnd(ev);
            if (now < end)
                continue;

            var hasResult = await db.EventResults.AnyAsync(r => r.EventId == ev.Id);
            if (hasResult)
            {
                ev.ResultPromptSentAt = now;
                continue;
            }

            var participantIds = await db.EventParticipants
                .Where(ep => ep.EventId == ev.Id &&
                             ep.Status != ParticipationStatus.CancelledEarly &&
                             ep.Status != ParticipationStatus.CancelledLate)
                .Select(ep => ep.UserId)
                .ToListAsync();

            if (!participantIds.Contains(ev.CreatorId))
                participantIds.Add(ev.CreatorId);

            var sportLabel = string.IsNullOrWhiteSpace(ev.Sport)
                ? "match"
                : char.ToUpperInvariant(ev.Sport[0]) + ev.Sport[1..].ToLowerInvariant();

            foreach (var userId in participantIds.Distinct())
            {
                await notif.SendPushNotificationToUserAsync(
                    userId,
                    "Add result",
                    $"Your {sportLabel} match has finished. Add the result.",
                    "result_prompt",
                    ev.Id,
                    data: new { eventId = ev.Id });
            }

            ev.ResultPromptSentAt = now;
        }

        await db.SaveChangesAsync();
    }

    /// <summary>
    /// Expires all Pending join requests on an event and notifies each requester.
    /// Idempotent: the WHERE Status=="Pending" filter makes repeated calls a no-op.
    /// Does not touch any Event column — idempotency is carried entirely by the
    /// request rows themselves.
    /// </summary>
    private static async Task ExpirePendingRequestsAsync(
        AppDbContext db, INotificationService notif,
        Guid eventId, string eventTitle, DateTime now)
    {
        // Collect requester IDs before the bulk update so we can notify them.
        var requesterIds = await db.EventJoinRequests
            .Where(r => r.EventId == eventId && r.Status == "Pending")
            .Select(r => r.RequesterId)
            .ToListAsync();

        if (requesterIds.Count == 0) return;

        await db.EventJoinRequests
            .Where(r => r.EventId == eventId && r.Status == "Pending")
            .ExecuteUpdateAsync(s => s
                .SetProperty(r => r.Status, "Expired")
                .SetProperty(r => r.ResolvedAt, now));

        foreach (var userId in requesterIds)
        {
            await notif.SendPushNotificationToUserAsync(
                userId,
                "Request Expired",
                $"Your request to join \"{eventTitle}\" has expired",
                "request_expired",
                eventId,
                data: new { eventId });
        }
    }
}
