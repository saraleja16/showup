namespace ShowUpBackend.Configuration;

public class MatchmakingOptions
{
    public const string SectionName = "Matchmaking";

    public double SportWeight { get; set; } = 0.30;
    public double SkillWeight { get; set; } = 0.25;
    public double ReliabilityWeight { get; set; } = 0.25;
    public double DistanceWeight { get; set; } = 0.20;

    public double MaximumDistanceKm { get; set; } = 50;
    public double AbsoluteMaximumDistanceKm { get; set; } = 100;
    public int MaximumReliabilityDifference { get; set; } = 40;
    public bool AllowAdjacentSkillLevels { get; set; } = true;

    public int DefaultPageSize { get; set; } = 20;
    public int AbsoluteMaximumPageSize { get; set; } = 50;

    public int CandidateFetchMultiplier { get; set; } = 5;
}
