using ShowUpBackend.Sports;

namespace ShowUpBackend.Tests;

public class TennisSportValidationTests
{
    private static readonly TennisSport _tennis = new();
    private static readonly PickleballSport _pickleball = new();

    // Minimum valid tennis payload (singular bringingBall).
    private const string ValidJson =
        """{"format":"singles","sessionType":"match","durationMinutes":60,"bringingBall":true,"skillLevel":"Intermediate"}""";

    [Fact]
    public void Validate_rejects_missing_bringingBall()
    {
        const string json =
            """{"format":"singles","sessionType":"match","durationMinutes":60,"skillLevel":"Intermediate"}""";

        var error = _tennis.Validate(json);

        Assert.NotNull(error);
        Assert.Contains("bringingBall", error, StringComparison.Ordinal);
        Assert.Contains("required", error, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Validate_rejects_plural_bringingBalls_key()
    {
        // The old (broken) key must no longer satisfy the validator.
        const string json =
            """{"format":"singles","sessionType":"match","durationMinutes":60,"bringingBalls":true,"skillLevel":"Intermediate"}""";

        var error = _tennis.Validate(json);

        Assert.NotNull(error);
        Assert.Contains("bringingBall", error, StringComparison.Ordinal);
    }

    [Fact]
    public void Validate_accepts_valid_tennis_payload_with_bringingBall_true()
    {
        var error = _tennis.Validate(ValidJson);

        Assert.Null(error);
    }

    [Fact]
    public void Validate_accepts_valid_tennis_payload_with_bringingBall_false()
    {
        const string json =
            """{"format":"doubles","sessionType":"hitting","durationMinutes":90,"bringingBall":false,"skillLevel":"Advanced"}""";

        var error = _tennis.Validate(json);

        Assert.Null(error);
    }

    // ── Pickleball session types ─────────────────────────────────────────────

    [Fact]
    public void Pickleball_accepts_casual_sessionType()
    {
        // "casual" is a pickleball-specific session type; must pass pickleball validation.
        const string json =
            """{"format":"singles","sessionType":"casual","durationMinutes":60,"bringingBall":true,"skillLevel":"Intermediate"}""";

        var error = _pickleball.Validate(json);

        Assert.Null(error);
    }

    [Fact]
    public void Pickleball_accepts_training_sessionType()
    {
        const string json =
            """{"format":"singles","sessionType":"training","durationMinutes":60,"bringingBall":false,"skillLevel":"Beginner"}""";

        var error = _pickleball.Validate(json);

        Assert.Null(error);
    }

    [Fact]
    public void Pickleball_rejects_hitting_sessionType()
    {
        // "hitting" is tennis-only and must be rejected for pickleball events.
        const string json =
            """{"format":"singles","sessionType":"hitting","durationMinutes":60,"bringingBall":true,"skillLevel":"Intermediate"}""";

        var error = _pickleball.Validate(json);

        Assert.NotNull(error);
        Assert.Contains("sessionType", error, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Tennis_still_accepts_hitting_sessionType()
    {
        // Parameterizing PickleballSport must not break the tennis defaults.
        const string json =
            """{"format":"singles","sessionType":"hitting","durationMinutes":60,"bringingBall":true,"skillLevel":"Intermediate"}""";

        var error = _tennis.Validate(json);

        Assert.Null(error);
    }

    [Fact]
    public void Tennis_rejects_casual_sessionType()
    {
        // "casual" is pickleball-specific; must still be rejected by tennis.
        const string json =
            """{"format":"singles","sessionType":"casual","durationMinutes":60,"bringingBall":true,"skillLevel":"Intermediate"}""";

        var error = _tennis.Validate(json);

        Assert.NotNull(error);
        Assert.Contains("sessionType", error, StringComparison.OrdinalIgnoreCase);
    }
}
