using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using ShowUpBackend.Data;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Models.Entities;
using ShowUpBackend.Services.Interfaces;
using ShowUpBackend.Sports;

namespace ShowUpBackend.Services;

/// <summary>
/// Confirmation rule (MVP, current architecture — no team/captain tables):
/// - Any active event participant other than the submitter may confirm or dispute.
/// - For 1v1 (exactly two active participants) this means the opponent.
/// - Host may confirm/dispute if they are not the submitter.
///
/// Persistence rules:
/// - One EventResult row per EventId (unique index).
/// - First successful submit → PendingConfirmation (locked against overwrite).
/// - Duplicate submit while Pending returns the saved row (idempotent).
/// - Confirmed is immutable via normal submit.
/// - Disputed may be amended via submit (explicit resubmit workflow).
/// </summary>
public class EventResultService : IEventResultService
{
    private readonly AppDbContext _db;
    private readonly INotificationService _notifications;
    private readonly ILogger<EventResultService> _logger;

    public EventResultService(
        AppDbContext db,
        INotificationService notifications,
        ILogger<EventResultService> logger)
    {
        _db = db;
        _notifications = notifications;
        _logger = logger;
    }

    public async Task<(EventResultSummaryDto? Result, string? Error, int StatusCode)> GetAsync(Guid eventId)
    {
        var result = await _db.EventResults.AsNoTracking()
            .FirstOrDefaultAsync(r => r.EventId == eventId);
        if (result is null)
            return (null, "Result not found", 404);
        return (EventStatusProjection.MapResultSummary(result), null, 200);
    }

    public async Task<(EventResultSummaryDto? Result, string? Error, int StatusCode)> SubmitAsync(
        Guid eventId, SubmitEventResultRequest request)
    {
        // Normalize pickleball/clients that send games instead of sets.
        if ((request.Sets is null || request.Sets.Count == 0) &&
            request.Games is { Count: > 0 })
        {
            request.Sets = request.Games;
        }

        var ev = await _db.Events.FirstOrDefaultAsync(e => e.Id == eventId);
        if (ev is null)
            return (null, "Event not found", 404);

        if (!SportCatalog.IsEnabled(ev.Sport))
            return (null, $"Unsupported sport: {ev.Sport}", 400);

        if (!EventLifecycleCalculator.IsScoredMatch(ev))
            return (null, "This activity does not require a score result", 400);

        var now = DateTime.UtcNow;
        if (now < ev.ScheduledAt)
            return (null, "Cannot submit a result before the event starts", 400);

        if (request.SubmittedByUserId == Guid.Empty)
            return (null, "submittedByUserId is required", 400);

        if (!await IsActiveParticipantAsync(eventId, request.SubmittedByUserId))
            return (null, "Only event participants may submit a result", 403);

        var existing = await _db.EventResults.FirstOrDefaultAsync(r => r.EventId == eventId);

        // Confirmed scores are immutable through the normal submit endpoint.
        if (existing is not null && existing.Status == EventResultStatus.Confirmed)
            return (null, "A confirmed result already exists", 409);

        // Pending result is locked — duplicate Submit returns the persisted row (no overwrite).
        if (existing is not null && existing.Status == EventResultStatus.PendingConfirmation)
        {
            _logger.LogInformation(
                "ResultSubmit idempotent return eventId={EventId} userId={UserId} sport={Sport} status={Status} resultId={ResultId}",
                eventId, request.SubmittedByUserId, ev.Sport, existing.Status, existing.Id);
            return (EventStatusProjection.MapResultSummary(existing), null, 200);
        }

        var (ok, error, scoreJson, scoreA, scoreB, unitsA, unitsB, summary) =
            SportResultValidators.Validate(ev.Sport, request);
        if (!ok)
        {
            _logger.LogInformation(
                "ResultSubmit validation failed eventId={EventId} userId={UserId} sport={Sport} error={Error}",
                eventId, request.SubmittedByUserId, ev.Sport, error);
            return (null, error, 400);
        }

        var isNew = existing is null;
        if (isNew)
        {
            existing = new EventResult
            {
                Id = Guid.NewGuid(),
                EventId = eventId
            };
            _db.EventResults.Add(existing);
        }

        existing!.Sport = ev.Sport.ToLowerInvariant();
        existing.ScoreJson = scoreJson;
        existing.Status = EventResultStatus.PendingConfirmation;
        existing.SubmittedByUserId = request.SubmittedByUserId;
        existing.SubmittedAt = now;
        existing.ConfirmedByUserId = null;
        existing.ConfirmedAt = null;
        existing.DisputedByUserId = null;
        existing.DisputedAt = null;
        existing.SideALabel = request.SideALabel;
        existing.SideBLabel = request.SideBLabel;
        existing.ScoreA = scoreA;
        existing.ScoreB = scoreB;
        existing.UnitsWonA = unitsA;
        existing.UnitsWonB = unitsB;
        existing.Summary = summary;

        // Prefer real participant display names over generic "Side B" labels.
        if (string.IsNullOrWhiteSpace(existing.SideALabel) || string.IsNullOrWhiteSpace(existing.SideBLabel))
        {
            var named = await _db.EventParticipants.AsNoTracking()
                .Where(p => p.EventId == eventId &&
                            p.Status != ParticipationStatus.CancelledEarly &&
                            p.Status != ParticipationStatus.CancelledLate)
                .Join(_db.Users.AsNoTracking(), p => p.UserId, u => u.Id, (p, u) => new { p.UserId, u.DisplayName, IsHost = p.UserId == ev.CreatorId })
                .OrderByDescending(x => x.IsHost)
                .ThenBy(x => x.DisplayName)
                .ToListAsync();

            if (named.Count > 0 && string.IsNullOrWhiteSpace(existing.SideALabel))
                existing.SideALabel = named[0].DisplayName;
            if (named.Count > 1 && string.IsNullOrWhiteSpace(existing.SideBLabel))
                existing.SideBLabel = named.FirstOrDefault(x => x.UserId != named[0].UserId)?.DisplayName;
        }

        int affected;
        try
        {
            affected = await _db.SaveChangesAsync();
        }
        catch (DbUpdateException ex)
        {
            _logger.LogWarning(ex,
                "ResultSubmit SaveChanges conflict eventId={EventId} userId={UserId}",
                eventId, request.SubmittedByUserId);

            // Race: another request inserted the unique EventId row first.
            var raced = await _db.EventResults.AsNoTracking()
                .FirstOrDefaultAsync(r => r.EventId == eventId);
            if (raced is not null)
                return (EventStatusProjection.MapResultSummary(raced), null, 200);

            throw;
        }

        // Reload from DB so response reflects persisted columns (jsonb, timestamps).
        var saved = await _db.EventResults.AsNoTracking()
            .FirstAsync(r => r.Id == existing.Id);

        _logger.LogInformation(
            "ResultSubmit saved eventId={EventId} userId={UserId} sport={Sport} status={Status} validationPassed=true entityOp={EntityOp} saveChangesAffected={Affected} resultId={ResultId}",
            eventId,
            request.SubmittedByUserId,
            saved.Sport,
            saved.Status,
            isNew ? "Added" : "Updated",
            affected,
            saved.Id);

        var others = await GetActiveParticipantIdsAsync(eventId);
        foreach (var userId in others.Where(id => id != request.SubmittedByUserId))
        {
            await _notifications.SendPushNotificationToUserAsync(
                userId,
                "Result submitted",
                "A result was submitted. Confirm it.",
                "result_pending_confirmation",
                eventId);
        }

        return (EventStatusProjection.MapResultSummary(saved), null, 200);
    }

    public async Task<(EventResultSummaryDto? Result, string? Error, int StatusCode)> ConfirmAsync(
        Guid eventId, ConfirmEventResultRequest request)
    {
        var result = await _db.EventResults.FirstOrDefaultAsync(r => r.EventId == eventId);
        if (result is null)
            return (null, "Result not found", 404);

        if (result.Status == EventResultStatus.Confirmed)
            return (EventStatusProjection.MapResultSummary(result), null, 200);

        if (result.Status != EventResultStatus.PendingConfirmation &&
            result.Status != EventResultStatus.Disputed)
        {
            return (null, "Result cannot be confirmed in its current state", 400);
        }

        if (request.ConfirmedByUserId == result.SubmittedByUserId)
            return (null, "Submitter cannot confirm their own result", 400);

        if (!await IsActiveParticipantAsync(eventId, request.ConfirmedByUserId))
            return (null, "Only event participants may confirm a result", 403);

        result.Status = EventResultStatus.Confirmed;
        result.ConfirmedByUserId = request.ConfirmedByUserId;
        result.ConfirmedAt = DateTime.UtcNow;
        result.DisputedByUserId = null;
        result.DisputedAt = null;
        await _db.SaveChangesAsync();

        await _notifications.SendPushNotificationToUserAsync(
            result.SubmittedByUserId,
            "Result confirmed",
            "Result confirmed.",
            "result_confirmed",
            eventId);

        var saved = await _db.EventResults.AsNoTracking()
            .FirstAsync(r => r.Id == result.Id);
        return (EventStatusProjection.MapResultSummary(saved), null, 200);
    }

    public async Task<(EventResultSummaryDto? Result, string? Error, int StatusCode)> DisputeAsync(
        Guid eventId, DisputeEventResultRequest request)
    {
        var result = await _db.EventResults.FirstOrDefaultAsync(r => r.EventId == eventId);
        if (result is null)
            return (null, "Result not found", 404);

        if (result.Status == EventResultStatus.Confirmed)
            return (null, "Cannot dispute a confirmed result", 409);

        if (request.DisputedByUserId == result.SubmittedByUserId)
            return (null, "Submitter cannot dispute their own result", 400);

        if (!await IsActiveParticipantAsync(eventId, request.DisputedByUserId))
            return (null, "Only event participants may dispute a result", 403);

        // Keep original score payload; mark disputed for audit trail.
        result.Status = EventResultStatus.Disputed;
        result.DisputedByUserId = request.DisputedByUserId;
        result.DisputedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await _notifications.SendPushNotificationToUserAsync(
            result.SubmittedByUserId,
            "Result disputed",
            "Your submitted result was disputed.",
            "result_disputed",
            eventId);

        var saved = await _db.EventResults.AsNoTracking()
            .FirstAsync(r => r.Id == result.Id);
        return (EventStatusProjection.MapResultSummary(saved), null, 200);
    }

    private async Task<bool> IsActiveParticipantAsync(Guid eventId, Guid userId)
    {
        var ev = await _db.Events.AsNoTracking().FirstOrDefaultAsync(e => e.Id == eventId);
        if (ev is null) return false;
        if (ev.CreatorId == userId) return true;

        return await _db.EventParticipants.AnyAsync(p =>
            p.EventId == eventId &&
            p.UserId == userId &&
            p.Status != ParticipationStatus.CancelledEarly &&
            p.Status != ParticipationStatus.CancelledLate);
    }

    private async Task<List<Guid>> GetActiveParticipantIdsAsync(Guid eventId)
    {
        var ev = await _db.Events.AsNoTracking().FirstOrDefaultAsync(e => e.Id == eventId);
        var ids = await _db.EventParticipants
            .Where(p => p.EventId == eventId &&
                        p.Status != ParticipationStatus.CancelledEarly &&
                        p.Status != ParticipationStatus.CancelledLate)
            .Select(p => p.UserId)
            .ToListAsync();

        if (ev is not null && !ids.Contains(ev.CreatorId))
            ids.Add(ev.CreatorId);

        return ids;
    }
}
