namespace ShowUpBackend.Services.Interfaces;

public interface IReliabilityService
{
    Task<int> GetScoreAsync(Guid userId, CancellationToken cancellationToken = default);
    Task<IReadOnlyDictionary<Guid, int>> GetScoresAsync(IEnumerable<Guid> userIds, CancellationToken cancellationToken = default);
    Task<(int Score, string Tier, int SampleSize)> GetDetailsAsync(Guid userId, CancellationToken cancellationToken = default);
}
