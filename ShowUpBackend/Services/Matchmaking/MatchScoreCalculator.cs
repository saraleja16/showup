using ShowUpBackend.Configuration;

namespace ShowUpBackend.Services.Matchmaking;

public static class SkillLevels
{
    public const string Beginner = "Beginner";
    public const string Intermediate = "Intermediate";
    public const string Advanced = "Advanced";

    private static readonly Dictionary<string, int> Rank = new(StringComparer.OrdinalIgnoreCase)
    {
        [Beginner] = 0,
        [Intermediate] = 1,
        [Advanced] = 2
    };

    public static bool IsValid(string? value) =>
        !string.IsNullOrWhiteSpace(value) && Rank.ContainsKey(value.Trim());

    public static string Normalize(string value)
    {
        var trimmed = value.Trim();
        return Rank.Keys.First(k => k.Equals(trimmed, StringComparison.OrdinalIgnoreCase));
    }

    public static int? TryGetRank(string? value) =>
        value is not null && Rank.TryGetValue(value.Trim(), out var rank) ? rank : null;

    public static int LevelDifference(string a, string b)
    {
        var ra = TryGetRank(a);
        var rb = TryGetRank(b);
        if (ra is null || rb is null) return int.MaxValue;
        return Math.Abs(ra.Value - rb.Value);
    }
}

public static class GeoDistance
{
    private const double EarthRadiusKm = 6371.0;

    public static double HaversineKm(double lat1, double lon1, double lat2, double lon2)
    {
        var dLat = DegreesToRadians(lat2 - lat1);
        var dLon = DegreesToRadians(lon2 - lon1);
        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                Math.Cos(DegreesToRadians(lat1)) * Math.Cos(DegreesToRadians(lat2)) *
                Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
        var c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
        return EarthRadiusKm * c;
    }

    public static double RoundApproximate(double distanceKm) =>
        Math.Round(distanceKm, 1, MidpointRounding.AwayFromZero);

    public static (double MinLat, double MaxLat, double MinLng, double MaxLng) BoundingBox(
        double latitude, double longitude, double radiusKm)
    {
        var latDelta = radiusKm / 111.0;
        var cosLat = Math.Cos(DegreesToRadians(latitude));
        var lngDelta = radiusKm / (111.0 * Math.Max(cosLat, 0.01));
        return (
            latitude - latDelta,
            latitude + latDelta,
            longitude - lngDelta,
            longitude + lngDelta);
    }

    private static double DegreesToRadians(double degrees) => degrees * Math.PI / 180.0;
}

public static class MatchScoreCalculator
{
    public static double SportScore(int sharedCount, int requesterSportCount)
    {
        if (sharedCount <= 0) return 0;
        var denom = Math.Max(requesterSportCount, 1);
        // At least one shared is mandatory; additional shared sports raise score toward 1.
        return Math.Clamp(0.6 + 0.4 * ((sharedCount - 1) / (double)denom), 0, 1);
    }

    public static double? SkillScore(string requesterSkill, string candidateSkill, MatchmakingOptions options)
    {
        var diff = SkillLevels.LevelDifference(requesterSkill, candidateSkill);
        if (diff == 0) return 1.0;
        if (diff == 1 && options.AllowAdjacentSkillLevels) return 0.55;
        return null; // incompatible
    }

    public static double? ReliabilityScore(int requesterScore, int candidateScore, MatchmakingOptions options)
    {
        var diff = Math.Abs(requesterScore - candidateScore);
        if (diff > options.MaximumReliabilityDifference) return null;
        return 1.0 - (diff / (double)Math.Max(options.MaximumReliabilityDifference, 1));
    }

    public static double DistanceScore(double distanceKm, double maxDistanceKm)
    {
        if (maxDistanceKm <= 0) return 0;
        return Math.Clamp(1.0 - (distanceKm / maxDistanceKm), 0, 1);
    }

    public static double Combine(
        double sport,
        double skill,
        double reliability,
        double distance,
        MatchmakingOptions options)
    {
        return (sport * options.SportWeight)
             + (skill * options.SkillWeight)
             + (reliability * options.ReliabilityWeight)
             + (distance * options.DistanceWeight);
    }
}
