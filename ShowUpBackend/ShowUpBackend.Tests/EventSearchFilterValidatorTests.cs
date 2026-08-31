using ShowUpBackend.Configuration;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Services;
using ShowUpBackend.Services.Matchmaking;

namespace ShowUpBackend.Tests;

public class EventSearchFilterValidatorTests
{
    private static readonly MatchmakingOptions Options = new()
    {
        AbsoluteMaximumDistanceKm = 100,
        MaximumDistanceKm = 50
    };

    [Fact]
    public void Tennis_within_5km_maps_sport_and_radius()
    {
        // Expected AI output for: "Find me tennis within 5 km"
        var raw = new AiEventSearchFilterPayload
        {
            Sport = "Tennis",
            RadiusKm = 5
        };

        var filters = EventSearchFilterValidator.Validate(raw, Options);

        Assert.Equal("tennis", filters.Sport);
        Assert.Equal(5, filters.RadiusKm);
        Assert.Null(filters.SkillLevel);
    }

    [Fact]
    public void Beginner_soccer_tomorrow_evening_within_10km()
    {
        var tomorrow = DateOnly.FromDateTime(DateTime.UtcNow.Date.AddDays(1));
        var raw = new AiEventSearchFilterPayload
        {
            Sport = "Soccer",
            RadiusKm = 10,
            SkillLevel = "Beginner",
            Date = tomorrow.ToString("yyyy-MM-dd"),
            StartTime = "17:00",
            EndTime = "22:00"
        };

        var filters = EventSearchFilterValidator.Validate(raw, Options);

        Assert.Equal("soccer", filters.Sport);
        Assert.Equal(10, filters.RadiusKm);
        Assert.Equal(SkillLevels.Beginner, filters.SkillLevel);
        Assert.Equal(tomorrow, filters.Date);
        Assert.Equal(new TimeOnly(17, 0), filters.StartTime);
        Assert.Equal(new TimeOnly(22, 0), filters.EndTime);
    }

    [Fact]
    public void Nearby_anything_can_be_radius_only()
    {
        // Expected AI output for: "Show me anything nearby"
        var raw = new AiEventSearchFilterPayload { RadiusKm = 50 };
        var filters = EventSearchFilterValidator.Validate(raw, Options);
        Assert.Null(filters.Sport);
        Assert.Equal(50, filters.RadiusKm);
    }

    [Fact]
    public void Find_volleyball_maps_sport_only()
    {
        var raw = new AiEventSearchFilterPayload { Sport = "volleyball" };
        var filters = EventSearchFilterValidator.Validate(raw, Options);
        Assert.Equal("volleyball", filters.Sport);
        Assert.Null(filters.RadiusKm);
    }

    [Fact]
    public void Unsupported_sport_is_ignored()
    {
        var raw = new AiEventSearchFilterPayload { Sport = "quidditch", RadiusKm = 5 };
        var filters = EventSearchFilterValidator.Validate(raw, Options);
        Assert.Null(filters.Sport);
        Assert.Equal(5, filters.RadiusKm);
    }

    [Fact]
    public void Invalid_skill_and_date_are_ignored()
    {
        var raw = new AiEventSearchFilterPayload
        {
            SkillLevel = "Pro",
            Date = "not-a-date",
            StartTime = "25:99",
            RadiusKm = 0.5
        };

        var filters = EventSearchFilterValidator.Validate(raw, Options);
        Assert.Null(filters.SkillLevel);
        Assert.Null(filters.Date);
        Assert.Null(filters.StartTime);
        Assert.Null(filters.RadiusKm);
    }

    [Fact]
    public void Radius_is_clamped_to_absolute_maximum()
    {
        var raw = new AiEventSearchFilterPayload { RadiusKm = 500 };
        var filters = EventSearchFilterValidator.Validate(raw, Options);
        Assert.Equal(100, filters.RadiusKm);
    }

    [Fact]
    public void Location_query_is_trimmed_and_length_capped()
    {
        var longQuery = new string('a', 200);
        var raw = new AiEventSearchFilterPayload { LocationQuery = "  " + longQuery + "  " };
        var filters = EventSearchFilterValidator.Validate(raw, Options);
        Assert.NotNull(filters.LocationQuery);
        Assert.Equal(EventSearchFilterValidator.MaxLocationQueryLength, filters.LocationQuery!.Length);
    }

    [Fact]
    public void Parses_soccer_within_5_km_typos()
    {
        var raw = NaturalLanguageEventSearchParser.Parse(
            "Find me a soccer game that is with in 5 kms away");
        Assert.Equal("soccer", raw.Sport);
        Assert.Equal(5, raw.RadiusKm);
    }

    [Fact]
    public void Parses_beginner_soccer_tomorrow_evening()
    {
        var raw = NaturalLanguageEventSearchParser.Parse(
            "Beginner soccer tomorrow evening within 10 km");
        Assert.Equal("soccer", raw.Sport);
        Assert.Equal(10, raw.RadiusKm);
        Assert.Equal("Beginner", raw.SkillLevel);
        Assert.NotNull(raw.Date);
        Assert.Equal("17:00", raw.StartTime);
        Assert.Equal("22:00", raw.EndTime);
    }
}
