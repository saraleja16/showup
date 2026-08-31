using System.Text.Json;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Sports;

namespace ShowUpBackend.Services;

public static class SportResultValidators
{
    public static (bool Ok, string? Error, string ScoreJson, int? ScoreA, int? ScoreB, int? UnitsWonA, int? UnitsWonB, string Summary)
        Validate(string sport, SubmitEventResultRequest request)
    {
        if (!SportCatalog.IsEnabled(sport))
            return (false, $"Unsupported sport: {sport}", "{}", null, null, null, null, string.Empty);

        return sport.ToLowerInvariant() switch
        {
            "soccer" => ValidateSoccer(request),
            "tennis" => ValidateTennis(request),
            "pickleball" => ValidatePickleball(request),
            "volleyball" => ValidateVolleyball(request),
            _ => (false, $"Results are not supported for sport: {sport}", "{}", null, null, null, null, string.Empty)
        };
    }

    private static (bool, string?, string, int?, int?, int?, int?, string) ValidateSoccer(SubmitEventResultRequest request)
    {
        if (request.ScoreA is null || request.ScoreB is null)
            return Fail("Soccer requires scoreA and scoreB.");
        if (request.ScoreA < 0 || request.ScoreB < 0)
            return Fail("Soccer scores cannot be negative.");
        if (request.ScoreA > 99 || request.ScoreB > 99)
            return Fail("Soccer scores are unrealistically high.");

        var a = request.ScoreA.Value;
        var b = request.ScoreB.Value;
        var json = JsonSerializer.Serialize(new { scoreA = a, scoreB = b });
        return (true, null, json, a, b, null, null, $"{a} - {b}");
    }

    private static (bool, string?, string, int?, int?, int?, int?, string) ValidateTennis(SubmitEventResultRequest request)
    {
        var sets = request.Sets ?? [];
        if (sets.Count is < 2 or > 3)
            return Fail("Tennis best-of-3 requires 2 or 3 sets.");

        var wonA = 0;
        var wonB = 0;
        foreach (var set in sets)
        {
            if (!IsValidTennisSet(set.SideA, set.SideB))
                return Fail($"Invalid tennis set: {set.SideA}-{set.SideB}.");
            if (set.SideA > set.SideB) wonA++;
            else wonB++;
        }

        if (Math.Max(wonA, wonB) < 2)
            return Fail("Tennis match is incomplete (need 2 set wins).");
        if (wonA == 2 && wonB == 2)
            return Fail("Tennis cannot end 2-2.");
        if (sets.Count == 3 && Math.Max(wonA, wonB) != 2)
            return Fail("Invalid tennis set wins.");
        if (sets.Count == 2 && (wonA != 2 && wonB != 2))
            return Fail("Two-set tennis matches must be 2-0.");

        var json = JsonSerializer.Serialize(new
        {
            sets = sets.Select(s => new { sideA = s.SideA, sideB = s.SideB })
        });
        var summary = string.Join(", ", sets.Select(s => $"{s.SideA}-{s.SideB}")) + $" ({wonA}-{wonB} sets)";
        return (true, null, json, null, null, wonA, wonB, summary);
    }

    private static bool IsValidTennisSet(int a, int b)
    {
        var high = Math.Max(a, b);
        var low = Math.Min(a, b);
        if (high < 6) return false;
        if (high == 6 && low <= 4) return true;
        if (high == 7 && low is 5 or 6) return true;
        return false;
    }

    private static (bool, string?, string, int?, int?, int?, int?, string) ValidatePickleball(SubmitEventResultRequest request)
    {
        var games = request.Sets ?? [];
        if (games.Count is < 2 or > 3)
            return Fail("Pickleball best-of-3 requires 2 or 3 games.");

        var wonA = 0;
        var wonB = 0;
        foreach (var g in games)
        {
            if (!IsValidPickleballGame(g.SideA, g.SideB))
                return Fail($"Invalid pickleball game: {g.SideA}-{g.SideB}.");
            if (g.SideA > g.SideB) wonA++;
            else wonB++;
        }

        if (Math.Max(wonA, wonB) < 2)
            return Fail("Pickleball match is incomplete (need 2 game wins).");
        if (games.Count == 2 && wonA != 2 && wonB != 2)
            return Fail("Two-game pickleball matches must be 2-0.");

        var json = JsonSerializer.Serialize(new
        {
            games = games.Select(s => new { sideA = s.SideA, sideB = s.SideB })
        });
        var summary = string.Join(", ", games.Select(s => $"{s.SideA}-{s.SideB}")) + $" ({wonA}-{wonB} games)";
        return (true, null, json, null, null, wonA, wonB, summary);
    }

    private static bool IsValidPickleballGame(int a, int b)
    {
        var high = Math.Max(a, b);
        var low = Math.Min(a, b);
        if (high < 11) return false;
        // Win by 2 once reaching 11; allow common casual scores up to 21.
        if (high >= 11 && high - low >= 2 && high <= 21) return true;
        return false;
    }

    private static (bool, string?, string, int?, int?, int?, int?, string) ValidateVolleyball(SubmitEventResultRequest request)
    {
        var sets = request.Sets ?? [];
        if (sets.Count is < 2 or > 5)
            return Fail("Volleyball requires 2 to 5 sets.");

        var wonA = 0;
        var wonB = 0;
        for (var i = 0; i < sets.Count; i++)
        {
            var set = sets[i];
            // Best-of-3: all sets to 25. Best-of-5: sets 1–4 to 25, 5th set to 15.
            var target = sets.Count >= 5 && i == 4 ? 15 : 25;

            if (!IsValidVolleyballSet(set.SideA, set.SideB, target))
                return Fail($"Invalid volleyball set: {set.SideA}-{set.SideB}.");
            if (set.SideA > set.SideB) wonA++;
            else wonB++;
        }

        if (Math.Max(wonA, wonB) < 2)
            return Fail("Volleyball match is incomplete (need at least 2 set wins).");

        var json = JsonSerializer.Serialize(new
        {
            sets = sets.Select(s => new { sideA = s.SideA, sideB = s.SideB })
        });
        var summary = string.Join(", ", sets.Select(s => $"{s.SideA}-{s.SideB}")) + $" ({wonA}-{wonB} sets)";
        return (true, null, json, null, null, wonA, wonB, summary);
    }

    private static bool IsValidVolleyballSet(int a, int b, int target)
    {
        var high = Math.Max(a, b);
        var low = Math.Min(a, b);
        if (high < target) return false;
        if (high == target && low <= target - 2) return true;
        if (high > target && high - low >= 2 && high <= target + 10) return true;
        return false;
    }

    private static (bool, string?, string, int?, int?, int?, int?, string) Fail(string error) =>
        (false, error, "{}", null, null, null, null, string.Empty);
}
