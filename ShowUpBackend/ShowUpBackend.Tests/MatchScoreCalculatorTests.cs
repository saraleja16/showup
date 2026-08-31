using ShowUpBackend.Configuration;
using ShowUpBackend.Services.Matchmaking;

namespace ShowUpBackend.Tests;

public class MatchScoreCalculatorTests
{
    private readonly MatchmakingOptions _options = new()
    {
        SportWeight = 0.30,
        SkillWeight = 0.25,
        ReliabilityWeight = 0.25,
        DistanceWeight = 0.20,
        MaximumDistanceKm = 50,
        MaximumReliabilityDifference = 40,
        AllowAdjacentSkillLevels = true
    };

    [Fact]
    public void Exact_skill_match_ranks_above_adjacent_skill()
    {
        var exact = MatchScoreCalculator.SkillScore("Intermediate", "Intermediate", _options)!.Value;
        var adjacent = MatchScoreCalculator.SkillScore("Intermediate", "Beginner", _options)!.Value;
        Assert.True(exact > adjacent);
    }

    [Fact]
    public void Two_level_skill_difference_is_incompatible()
    {
        Assert.Null(MatchScoreCalculator.SkillScore("Beginner", "Advanced", _options));
    }

    [Fact]
    public void Similar_reliability_ranks_above_very_different_reliability()
    {
        var close = MatchScoreCalculator.ReliabilityScore(85, 80, _options)!.Value;
        var far = MatchScoreCalculator.ReliabilityScore(85, 50, _options)!.Value;
        Assert.True(close > far);
    }

    [Fact]
    public void Reliability_beyond_max_difference_is_excluded()
    {
        Assert.Null(MatchScoreCalculator.ReliabilityScore(90, 40, _options));
    }

    [Fact]
    public void Closer_candidates_score_higher_on_distance()
    {
        var near = MatchScoreCalculator.DistanceScore(1.0, 50);
        var far = MatchScoreCalculator.DistanceScore(40.0, 50);
        Assert.True(near > far);
    }

    [Fact]
    public void More_shared_sports_improves_sport_score()
    {
        var one = MatchScoreCalculator.SportScore(1, 3);
        var two = MatchScoreCalculator.SportScore(2, 3);
        Assert.True(two > one);
    }

    [Fact]
    public void Haversine_never_returns_coordinates_and_rounds_distance()
    {
        var km = GeoDistance.HaversineKm(-33.8688, 151.2093, -33.8700, 151.2100);
        var approx = GeoDistance.RoundApproximate(km);
        Assert.Equal(Math.Round(approx, 1), approx);
        Assert.True(approx >= 0);
    }

    [Fact]
    public void Combined_ranking_prefers_exact_skill_and_closer_distance_when_other_factors_equal()
    {
        var sport = MatchScoreCalculator.SportScore(1, 1);
        var rel = MatchScoreCalculator.ReliabilityScore(85, 85, _options)!.Value;

        var better = MatchScoreCalculator.Combine(
            sport,
            MatchScoreCalculator.SkillScore("Intermediate", "Intermediate", _options)!.Value,
            rel,
            MatchScoreCalculator.DistanceScore(2, 50),
            _options);

        var worse = MatchScoreCalculator.Combine(
            sport,
            MatchScoreCalculator.SkillScore("Intermediate", "Beginner", _options)!.Value,
            rel,
            MatchScoreCalculator.DistanceScore(20, 50),
            _options);

        Assert.True(better > worse);
    }
}
