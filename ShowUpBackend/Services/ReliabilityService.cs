using Microsoft.EntityFrameworkCore;
using ShowUpBackend.Data;
using ShowUpBackend.Models.Entities;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Services;

public class ReliabilityService : IReliabilityService
{
    private readonly AppDbContext _context;

    public ReliabilityService(AppDbContext context)
    {
        _context = context;
    }

    public async Task<int> GetScoreAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var scores = await GetScoresAsync([userId], cancellationToken);
        return scores.TryGetValue(userId, out var score) ? score : ReliabilityCalculator.DefaultScore;
    }

    public async Task<(int Score, string Tier, int SampleSize)> GetDetailsAsync(
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        var sample = await _context.EventParticipants
            .AsNoTracking()
            .Where(ep =>
                ep.UserId == userId &&
                (ep.Status == ParticipationStatus.Attended ||
                 ep.Status == ParticipationStatus.NoShow ||
                 ep.Status == ParticipationStatus.CancelledLate))
            .Join(
                _context.Events.AsNoTracking(),
                ep => ep.EventId,
                e => e.Id,
                (ep, e) => new { ep.Status, e.ScheduledAt })
            .OrderByDescending(x => x.ScheduledAt)
            .Take(20)
            .Select(x => x.Status)
            .ToListAsync(cancellationToken);

        return ReliabilityCalculator.ComputeFull(sample);
    }

    public async Task<IReadOnlyDictionary<Guid, int>> GetScoresAsync(
        IEnumerable<Guid> userIds,
        CancellationToken cancellationToken = default)
    {
        var idList = userIds.Distinct().ToList();
        if (idList.Count == 0)
            return new Dictionary<Guid, int>();

        // Reliability sample: final outcome statuses, most recent 20 by event date per user.
        // Attended=1.0, CancelledLate=0.4, NoShow=0.0.
        var samples = await _context.EventParticipants
            .AsNoTracking()
            .Where(ep =>
                idList.Contains(ep.UserId) &&
                (ep.Status == ParticipationStatus.Attended ||
                 ep.Status == ParticipationStatus.NoShow ||
                 ep.Status == ParticipationStatus.CancelledLate))
            .Join(
                _context.Events.AsNoTracking(),
                ep => ep.EventId,
                e => e.Id,
                (ep, e) => new { ep.UserId, ep.Status, e.ScheduledAt })
            .ToListAsync(cancellationToken);

        var result = new Dictionary<Guid, int>();
        foreach (var userId in idList)
        {
            var userSample = samples
                .Where(x => x.UserId == userId)
                .OrderByDescending(x => x.ScheduledAt)
                .Take(20)
                .Select(x => x.Status)
                .ToList();

            result[userId] = ReliabilityCalculator.ComputeScore(userSample);
        }

        return result;
    }
}

public static class ReliabilityCalculator
{
    public const int DefaultScore = 85;

    public static int ComputeScore(IReadOnlyList<ParticipationStatus> sample)
    {
        var n = sample.Count;
        var sumPoints = sample.Sum(status => status switch
        {
            ParticipationStatus.Attended => 1.0,
            ParticipationStatus.CancelledLate => 0.4,
            _ => 0.0
        });

        return (int)Math.Round((sumPoints + 10 * 0.85) / (n + 10) * 100);
    }

    public static string TierForScore(int score) =>
        score >= 90 ? "excellent"
        : score >= 75 ? "good"
        : score >= 60 ? "at_risk"
        : "unreliable";

    public static (int Score, string Tier, int SampleSize) ComputeFull(IReadOnlyList<ParticipationStatus> sample)
    {
        var score = ComputeScore(sample);
        return (score, TierForScore(score), sample.Count);
    }
}
