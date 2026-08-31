using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using ShowUpBackend.Configuration;
using ShowUpBackend.Data;
using ShowUpBackend.Helpers;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Models.Entities;
using ShowUpBackend.Services;
using ShowUpBackend.Services.Interfaces;
using ShowUpBackend.Services.Matchmaking;

namespace ShowUpBackend.Tests;

internal sealed class StubGeocodingService : IGeocodingService
{
    private static readonly Dictionary<string, GeocodedLocation> Places = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Wollongong"] = new("Wollongong NSW, Australia", -34.4278, 150.8931),
        ["Parramatta"] = new("Parramatta NSW, Australia", -33.8150, 151.0011),
        ["Bondi"] = new("Bondi NSW, Australia", -33.8915, 151.2767),
        ["Sydney"] = new("Sydney NSW, Australia", -33.8688, 151.2093),
        ["Sydney Cbd"] = new("Sydney NSW, Australia", -33.8688, 151.2093),
    };

    public Task<GeocodedLocation?> GeocodeAsync(string locationQuery, CancellationToken cancellationToken = default)
    {
        var key = locationQuery.Trim();
        if (Places.TryGetValue(key, out var hit))
            return Task.FromResult<GeocodedLocation?>(hit);

        // Prefix / contains match for "Wollongong NSW" etc.
        foreach (var (name, loc) in Places)
        {
            if (key.Contains(name, StringComparison.OrdinalIgnoreCase))
                return Task.FromResult<GeocodedLocation?>(loc);
        }

        return Task.FromResult<GeocodedLocation?>(null);
    }
}

internal sealed class ParsingAiSearchService : IAiSearchService
{
    private readonly MatchmakingOptions _options = new() { AbsoluteMaximumDistanceKm = 100 };

    public Task<(EventSearchFilters? Filters, string? Error)> ParseEventSearchQueryAsync(
        string query,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(query))
            return Task.FromResult<(EventSearchFilters?, string?)>((null, "Query is required."));
        if (query.Length > 500)
            return Task.FromResult<(EventSearchFilters?, string?)>((null, "Query must be at most 500 characters."));

        var raw = NaturalLanguageEventSearchParser.Parse(query);
        var filters = EventSearchFilterValidator.Validate(raw, _options);
        return Task.FromResult<(EventSearchFilters?, string?)>((filters, null));
    }
}

public class AiGeoSearchTests
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    // Approx: Wollongong beachfront
    private const double WollongongLat = -34.4240;
    private const double WollongongLng = 150.8930;
    // Sydney CBD — ~70 km from Wollongong
    private const double SydneyLat = -33.8688;
    private const double SydneyLng = 151.2093;

    [Fact]
    public void Parser_pickleball_around_wollongong()
    {
        var raw = NaturalLanguageEventSearchParser.Parse(
            "find me a pickle ball game thats around wollongong");
        Assert.Equal("pickleball", raw.Sport);
        Assert.Equal("Wollongong", raw.LocationQuery);
        Assert.Equal(10, raw.RadiusKm);
        Assert.Equal(AiSearchIntentTypes.Game, raw.IntentType);
    }

    [Fact]
    public void Parser_tennis_courts_near_wollongong_is_venue()
    {
        var raw = NaturalLanguageEventSearchParser.Parse("tennis courts near Wollongong");
        Assert.Equal("tennis", raw.Sport);
        Assert.Equal("Wollongong", raw.LocationQuery);
        Assert.Equal(AiSearchIntentTypes.Venue, raw.IntentType);
        Assert.Equal(10, raw.RadiusKm);
    }

    [Fact]
    public void Parser_soccer_within_5km_of_parramatta()
    {
        var raw = NaturalLanguageEventSearchParser.Parse("soccer games within 5 km of Parramatta");
        Assert.Equal("soccer", raw.Sport);
        Assert.Equal(5, raw.RadiusKm);
        Assert.Equal("Parramatta", raw.LocationQuery);
        Assert.Equal(AiSearchIntentTypes.Game, raw.IntentType);
    }

    [Fact]
    public void Parser_volleyball_tomorrow_evening_in_bondi()
    {
        var raw = NaturalLanguageEventSearchParser.Parse("volleyball tomorrow evening in Bondi");
        Assert.Equal("volleyball", raw.Sport);
        Assert.Equal("Bondi", raw.LocationQuery);
        Assert.NotNull(raw.Date);
        Assert.Equal("17:00", raw.StartTime);
        Assert.Equal("22:00", raw.EndTime);
    }

    [Fact]
    public async Task Pickleball_around_wollongong_excludes_sydney_events()
    {
        await using var factory = new AiSearchWebAppFactory
        {
            AiSearchOverride = new ParsingAiSearchService(),
            GeocodingOverride = new StubGeocodingService()
        };

        Guid nearId = Guid.Empty;
        Guid farId = Guid.Empty;
        var (client, _) = await SeedAndAuthAsync(factory, async (db, meId) =>
        {
            nearId = Guid.NewGuid();
            farId = Guid.NewGuid();
            db.Events.Add(BuildEvent(nearId, meId, "pickleball", WollongongLat, WollongongLng, DateTime.UtcNow.AddDays(2)));
            db.Events.Add(BuildEvent(farId, meId, "pickleball", SydneyLat, SydneyLng, DateTime.UtcNow.AddDays(2)));
            await db.SaveChangesAsync();
        });

        var response = await client.PostAsJsonAsync("/api/ai/search-events",
            new { query = "find me a pickle ball game thats around wollongong" });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<AiSearchEventsResponse>(JsonOptions);
        Assert.NotNull(body);
        Assert.Equal("pickleball", body.InterpretedFilters.Sport);
        Assert.Equal("Wollongong", body.InterpretedFilters.LocationQuery);
        Assert.NotNull(body.InterpretedFilters.ResolvedLocation);
        Assert.Contains("Wollongong", body.InterpretedFilters.ResolvedLocation!.Name, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(10, body.InterpretedFilters.RadiusKm);
        Assert.Contains(body.Events, e => e.Id == nearId);
        Assert.DoesNotContain(body.Events, e => e.Id == farId);
        Assert.All(body.Events, e =>
        {
            Assert.Equal("pickleball", e.Sport);
            Assert.True(e.DistanceKm is <= 10);
        });
    }

    [Fact]
    public async Task Tennis_courts_near_wollongong_returns_venues()
    {
        await using var factory = new AiSearchWebAppFactory
        {
            AiSearchOverride = new ParsingAiSearchService(),
            GeocodingOverride = new StubGeocodingService()
        };

        var (client, _) = await SeedAndAuthAsync(factory, async (db, _) =>
        {
            db.Venues.Add(new Venue
            {
                Id = 1,
                Name = "Wollongong Tennis Centre",
                Address = "Wollongong NSW",
                Latitude = WollongongLat,
                Longitude = WollongongLng,
                Sports = "tennis",
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            });
            db.Venues.Add(new Venue
            {
                Id = 2,
                Name = "Sydney Tennis Hub",
                Address = "Sydney NSW",
                Latitude = SydneyLat,
                Longitude = SydneyLng,
                Sports = "tennis",
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        });

        var response = await client.PostAsJsonAsync("/api/ai/search-events",
            new { query = "tennis courts near Wollongong" });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<AiSearchEventsResponse>(JsonOptions);

        Assert.NotNull(body);
        Assert.Equal(AiSearchIntentTypes.Venue, body.InterpretedFilters.IntentType);
        Assert.NotEmpty(body.Venues);
        Assert.All(body.Venues, v => Assert.Contains("tennis", v.Sports, StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(body.Venues, v => v.Name.Contains("Sydney", StringComparison.OrdinalIgnoreCase));
        Assert.Empty(body.Events);
    }

    [Fact]
    public async Task Unknown_location_returns_clean_error()
    {
        await using var factory = new AiSearchWebAppFactory
        {
            AiSearchOverride = new ParsingAiSearchService(),
            GeocodingOverride = new StubGeocodingService()
        };
        var (client, _) = await SeedAndAuthAsync(factory);
        var response = await client.PostAsJsonAsync("/api/ai/search-events",
            new { query = "pickleball around AtlantisCityXYZ" });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var json = await response.Content.ReadAsStringAsync();
        Assert.Contains("Location could not be found", json);
    }

    [Fact]
    public async Task Soccer_within_5km_of_parramatta_filters_distance()
    {
        await using var factory = new AiSearchWebAppFactory
        {
            AiSearchOverride = new ParsingAiSearchService(),
            GeocodingOverride = new StubGeocodingService()
        };

        Guid nearId = Guid.Empty;
        Guid farId = Guid.Empty;
        var (client, _) = await SeedAndAuthAsync(factory, async (db, meId) =>
        {
            nearId = Guid.NewGuid();
            farId = Guid.NewGuid();
            // ~1 km from Parramatta stub
            db.Events.Add(BuildEvent(nearId, meId, "soccer", -33.8170, 151.0030, DateTime.UtcNow.AddDays(1)));
            // Sydney CBD far from Parramatta
            db.Events.Add(BuildEvent(farId, meId, "soccer", SydneyLat, SydneyLng, DateTime.UtcNow.AddDays(1)));
            await db.SaveChangesAsync();
        });

        var body = await (await client.PostAsJsonAsync("/api/ai/search-events",
            new { query = "soccer games within 5 km of Parramatta" }))
            .Content.ReadFromJsonAsync<AiSearchEventsResponse>(JsonOptions);

        Assert.NotNull(body);
        Assert.Equal(5, body.InterpretedFilters.RadiusKm);
        Assert.Equal("Parramatta", body.InterpretedFilters.LocationQuery);
        Assert.Contains(body.Events, e => e.Id == nearId);
        Assert.DoesNotContain(body.Events, e => e.Id == farId);
    }

    private static async Task<(HttpClient Client, Guid UserId)> SeedAndAuthAsync(
        AiSearchWebAppFactory factory,
        Func<AppDbContext, Guid, Task>? seedExtra = null)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.EnsureCreatedAsync();

        var me = new User
        {
            Id = Guid.NewGuid(),
            FirstName = "Me",
            LastName = "User",
            DisplayName = "Me User",
            Username = "geouser_" + Guid.NewGuid().ToString("N")[..8],
            Email = $"geo_{Guid.NewGuid():N}@example.com",
            PasswordHash = "hash",
            DateOfBirth = new DateOnly(1995, 1, 1),
            Sex = "unspecified",
            PreferredSports = UserMapper.SerializePreferredSports(["tennis"]),
            SkillLevel = "Intermediate",
            // User is in Sydney — must NOT override Wollongong search centre
            Latitude = SydneyLat,
            Longitude = SydneyLng,
            LocationUpdatedAt = DateTime.UtcNow,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        db.Users.Add(me);
        await db.SaveChangesAsync();

        if (seedExtra is not null)
            await seedExtra(db, me.Id);

        var tokens = scope.ServiceProvider.GetRequiredService<ITokenService>();
        var token = tokens.CreateAccessToken(me);
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return (client, me.Id);
    }

    private static Event BuildEvent(
        Guid id, Guid creatorId, string sport, double lat, double lng, DateTime scheduledAt)
        => new()
        {
            Id = id,
            Title = $"{sport} game",
            Description = "real seeded event",
            CreatorId = creatorId,
            Sport = sport,
            Latitude = lat,
            Longitude = lng,
            ScheduledAt = DateTime.SpecifyKind(scheduledAt, DateTimeKind.Utc),
            MaxPlayers = 10,
            CreatedAt = DateTime.UtcNow
        };
}
