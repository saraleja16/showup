using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using ShowUpBackend.Data;
using ShowUpBackend.Helpers;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Models.Entities;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Tests;

public class MatchmakingWebAppFactory : WebApplicationFactory<Program>
{
    public string DbName { get; } = "MatchmakingTests_" + Guid.NewGuid();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        Environment.SetEnvironmentVariable("Jwt__Key", "TEST_JWT_SIGNING_KEY_32_CHARS_MIN_OK!!");

        builder.ConfigureServices(services =>
        {
            services.RemoveAll(typeof(DbContextOptions<AppDbContext>));
            services.RemoveAll(typeof(AppDbContext));

            services.AddDbContext<AppDbContext>(options =>
                options.UseInMemoryDatabase(DbName));

            services.RemoveAll<INotificationService>();
            services.AddSingleton<INotificationService, NoOpNotificationService>();
        });
    }
}

internal sealed class NoOpNotificationService : INotificationService
{
    public Task<bool> SendPushNotificationAsync(string expoPushToken, string title, string body, object? data = null)
        => Task.FromResult(true);

    public Task<bool> SendPushNotificationToUserAsync(Guid userId, string title, string body, string type = "general", Guid? eventId = null, object? data = null)
        => Task.FromResult(true);

    public Task<List<NotificationDto>> GetUserNotificationsAsync(Guid userId)
        => Task.FromResult(new List<NotificationDto>());

    public Task<int> GetUnreadCountAsync(Guid userId) => Task.FromResult(0);
    public Task MarkAsReadAsync(Guid notificationId) => Task.CompletedTask;
    public Task MarkAllAsReadAsync(Guid userId) => Task.CompletedTask;
}

public class MatchmakingIntegrationTests
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    [Fact]
    public async Task Unauthenticated_candidates_are_rejected()
    {
        await using var factory = new MatchmakingWebAppFactory();
        var client = factory.CreateClient();
        var response = await client.GetAsync("/api/matches/candidates?latitude=-33.86&longitude=151.21");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Invalid_coordinates_are_rejected()
    {
        await using var factory = new MatchmakingWebAppFactory();
        var (client, _) = await SeedAndAuthAsync(factory);
        var response = await client.GetAsync("/api/matches/candidates?latitude=999&longitude=151.21");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task User_cannot_receive_themselves_and_must_share_sport()
    {
        await using var factory = new MatchmakingWebAppFactory();
        var (client, me) = await SeedAndAuthAsync(factory, async (db, _) =>
        {
            db.Users.Add(BuildUser("Other Same Sport", "othersport", "tennis", "Intermediate", -33.87, 151.21));
            db.Users.Add(BuildUser("Other Diff Sport", "otherdiff", "soccer", "Intermediate", -33.87, 151.22));
            await db.SaveChangesAsync();
        });

        var payload = await client.GetFromJsonAsync<MatchCandidatesResponse>(
            "/api/matches/candidates?latitude=-33.86&longitude=151.21&radiusKm=50", JsonOptions);

        Assert.NotNull(payload);
        Assert.DoesNotContain(payload.Items, i => i.UserId == me);
        Assert.All(payload.Items, i => Assert.Contains("tennis", i.SharedSports));
        Assert.DoesNotContain(payload.Items, i => i.DisplayName == "Other Diff Sport");
    }

    [Fact]
    public async Task Exact_skill_and_closer_distance_rank_higher()
    {
        await using var factory = new MatchmakingWebAppFactory();
        Guid exactClose = Guid.Empty;
        Guid adjacentFar = Guid.Empty;

        var (client, _) = await SeedAndAuthAsync(factory, async (db, _) =>
        {
            var a = BuildUser("Exact Close", "exactclose", "tennis", "Intermediate", -33.8690, 151.2095);
            var b = BuildUser("Adjacent Far", "adjacentfar", "tennis", "Beginner", -33.9000, 151.2500);
            exactClose = a.Id;
            adjacentFar = b.Id;
            db.Users.AddRange(a, b);
            await db.SaveChangesAsync();
        });

        var payload = await client.GetFromJsonAsync<MatchCandidatesResponse>(
            "/api/matches/candidates?latitude=-33.8688&longitude=151.2093&radiusKm=50", JsonOptions);

        Assert.NotNull(payload);
        var first = payload.Items.First();
        Assert.Equal(exactClose, first.UserId);
        Assert.Contains(payload.Items, i => i.UserId == adjacentFar);
    }

    [Fact]
    public async Task Similar_reliability_ranks_above_very_different()
    {
        await using var factory = new MatchmakingWebAppFactory();
        Guid similarId = Guid.Empty;
        Guid differentId = Guid.Empty;

        var (client, me) = await SeedAndAuthAsync(factory, async (db, viewerId) =>
        {
            var similar = BuildUser("Similar Rel", "simrel", "tennis", "Intermediate", -33.8690, 151.2095);
            var different = BuildUser("Diff Rel", "diffrel", "tennis", "Intermediate", -33.8691, 151.2096);
            similarId = similar.Id;
            differentId = different.Id;
            db.Users.AddRange(similar, different);

            // Create events and attendance so reliability diverges.
            var past = DateTime.UtcNow.AddDays(-3);
            for (var i = 0; i < 12; i++)
            {
                var ev = new Event
                {
                    Id = Guid.NewGuid(),
                    Title = $"E{i}",
                    Description = "d",
                    CreatorId = viewerId,
                    Latitude = -33.86,
                    Longitude = 151.21,
                    ScheduledAt = past.AddHours(-i),
                    MaxPlayers = 10,
                    Sport = "tennis",
                    CreatedAt = DateTime.UtcNow
                };
                db.Events.Add(ev);
                db.EventParticipants.Add(new EventParticipant
                {
                    Id = Guid.NewGuid(),
                    EventId = ev.Id,
                    UserId = viewerId,
                    Status = ParticipationStatus.Attended,
                    JoinedAt = DateTime.UtcNow
                });
                db.EventParticipants.Add(new EventParticipant
                {
                    Id = Guid.NewGuid(),
                    EventId = ev.Id,
                    UserId = similarId,
                    Status = ParticipationStatus.Attended,
                    JoinedAt = DateTime.UtcNow
                });
                db.EventParticipants.Add(new EventParticipant
                {
                    Id = Guid.NewGuid(),
                    EventId = ev.Id,
                    UserId = differentId,
                    Status = ParticipationStatus.NoShow,
                    JoinedAt = DateTime.UtcNow
                });
            }

            await db.SaveChangesAsync();
        });

        var payload = await client.GetFromJsonAsync<MatchCandidatesResponse>(
            "/api/matches/candidates?latitude=-33.8688&longitude=151.2093&radiusKm=50", JsonOptions);

        Assert.NotNull(payload);
        var ids = payload.Items.Select(i => i.UserId).ToList();
        Assert.Contains(similarId, ids);
        // Different reliability may be filtered out by MaximumReliabilityDifference; if present, must rank lower.
        if (ids.Contains(differentId))
            Assert.True(ids.IndexOf(similarId) < ids.IndexOf(differentId));
    }

    [Fact]
    public async Task Skipped_users_do_not_reappear()
    {
        await using var factory = new MatchmakingWebAppFactory();
        Guid otherId = Guid.Empty;
        var (client, _) = await SeedAndAuthAsync(factory, async (db, _) =>
        {
            var other = BuildUser("Skip Me", "skipme", "tennis", "Intermediate", -33.865, 151.21);
            otherId = other.Id;
            db.Users.Add(other);
            await db.SaveChangesAsync();
        });

        var before = await client.GetFromJsonAsync<MatchCandidatesResponse>(
            "/api/matches/candidates?latitude=-33.86&longitude=151.21", JsonOptions);
        Assert.Contains(before!.Items, i => i.UserId == otherId);

        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync($"/api/matches/{otherId}/skip", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync($"/api/matches/{otherId}/skip", null)).StatusCode);

        var after = await client.GetFromJsonAsync<MatchCandidatesResponse>(
            "/api/matches/candidates?latitude=-33.86&longitude=151.21", JsonOptions);
        Assert.DoesNotContain(after!.Items, i => i.UserId == otherId);
    }

    [Fact]
    public async Task Existing_connections_and_blocks_do_not_appear()
    {
        await using var factory = new MatchmakingWebAppFactory();
        Guid connectedId = Guid.Empty;
        Guid blockedId = Guid.Empty;

        var (client, _) = await SeedAndAuthAsync(factory, async (db, me) =>
        {
            var connected = BuildUser("Connected", "connected1", "tennis", "Intermediate", -33.865, 151.21);
            var blocked = BuildUser("Blocked", "blocked1", "tennis", "Intermediate", -33.864, 151.21);
            connectedId = connected.Id;
            blockedId = blocked.Id;
            db.Users.AddRange(connected, blocked);
            await db.SaveChangesAsync();

            var (a, b) = Connection.CanonicalPair(me, connectedId);
            db.Connections.Add(new Connection { Id = Guid.NewGuid(), UserAId = a, UserBId = b, CreatedAt = DateTime.UtcNow });
            db.UserBlocks.Add(new UserBlock { Id = Guid.NewGuid(), BlockerUserId = me, BlockedUserId = blockedId, CreatedAt = DateTime.UtcNow });
            await db.SaveChangesAsync();
        });

        var payload = await client.GetFromJsonAsync<MatchCandidatesResponse>(
            "/api/matches/candidates?latitude=-33.86&longitude=151.21", JsonOptions);

        Assert.DoesNotContain(payload!.Items, i => i.UserId == connectedId);
        Assert.DoesNotContain(payload.Items, i => i.UserId == blockedId);
    }

    [Fact]
    public async Task Candidates_never_include_exact_coordinates_or_emails()
    {
        await using var factory = new MatchmakingWebAppFactory();
        var (client, _) = await SeedAndAuthAsync(factory, async (db, _) =>
        {
            db.Users.Add(BuildUser("Near", "nearuser", "tennis", "Intermediate", -33.865, 151.21));
            await db.SaveChangesAsync();
        });

        var response = await client.GetAsync("/api/matches/candidates?latitude=-33.86&longitude=151.21");
        var json = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("\"latitude\"", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("\"longitude\"", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("@example.com", json);
        Assert.DoesNotContain("password", json, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("approximateDistanceKm", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Put_me_location_saves_last_known_coords_from_jwt_user_only()
    {
        await using var factory = new MatchmakingWebAppFactory();
        var (client, me) = await SeedAndAuthAsync(factory);

        var response = await client.PutAsJsonAsync("/api/users/me/location", new
        {
            latitude = -33.8915,
            longitude = 151.2767
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var saved = await db.Users.AsNoTracking().FirstAsync(u => u.Id == me);
        Assert.Equal(-33.8915, saved.Latitude);
        Assert.Equal(151.2767, saved.Longitude);
        Assert.NotNull(saved.LocationUpdatedAt);
    }

    [Fact]
    public async Task Offline_user_with_saved_location_still_appears_for_nearby_search()
    {
        // User A saved Bondi coords earlier and is not making further requests ("offline").
        // User B (authenticated client) searches near Bondi and must still see A.
        await using var factory = new MatchmakingWebAppFactory();
        Guid offlineUserId = Guid.Empty;
        var staleStamp = DateTime.UtcNow.AddDays(-3);

        var (client, _) = await SeedAndAuthAsync(factory, async (db, _) =>
        {
            var offline = BuildUser("Offline Bondi", "offlinebondi", "tennis", "Intermediate", -33.8915, 151.2767);
            offline.LocationUpdatedAt = staleStamp;
            offlineUserId = offline.Id;
            db.Users.Add(offline);

            // No location → must not appear / must not crash query.
            var noLoc = BuildUser("No Location", "nolocation1", "tennis", "Intermediate", -33.8915, 151.2767);
            noLoc.Latitude = null;
            noLoc.Longitude = null;
            noLoc.LocationUpdatedAt = null;
            db.Users.Add(noLoc);

            await db.SaveChangesAsync();
        });

        var payload = await client.GetFromJsonAsync<MatchCandidatesResponse>(
            "/api/matches/candidates?latitude=-33.8915&longitude=151.2767&radiusKm=5", JsonOptions);

        Assert.NotNull(payload);
        Assert.Single(payload.Items, i => i.UserId == offlineUserId);
        Assert.DoesNotContain(payload.Items, i => i.DisplayName == "No Location");

        // Match request still works against the offline user.
        var connect = await client.PostAsync($"/api/matches/{offlineUserId}/connect", null);
        Assert.Equal(HttpStatusCode.OK, connect.StatusCode);
        var action = await connect.Content.ReadFromJsonAsync<MatchActionResponse>(JsonOptions);
        Assert.NotNull(action);
        Assert.True(action.Success);
        Assert.False(action.IsMutualMatch);
    }

    [Fact]
    public async Task Connect_is_idempotent_and_mutual_creates_one_connection()
    {
        await using var factory = new MatchmakingWebAppFactory();
        Guid otherId = Guid.Empty;

        var (client, me) = await SeedAndAuthAsync(factory, async (db, _) =>
        {
            var other = BuildUser("Mutual", "mutual1", "tennis", "Intermediate", -33.865, 151.21);
            otherId = other.Id;
            db.Users.Add(other);
            await db.SaveChangesAsync();
        });

        string otherToken;
        using (var scope = factory.Services.CreateScope())
        {
            var tokens = scope.ServiceProvider.GetRequiredService<ITokenService>();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var other = await db.Users.FirstAsync(u => u.Id == otherId);
            otherToken = tokens.CreateAccessToken(other);
        }

        var firstBody = await (await client.PostAsync($"/api/matches/{otherId}/connect", null))
            .Content.ReadFromJsonAsync<MatchActionResponse>(JsonOptions);
        Assert.True(firstBody!.Success);
        Assert.False(firstBody.IsMutualMatch);

        var againBody = await (await client.PostAsync($"/api/matches/{otherId}/connect", null))
            .Content.ReadFromJsonAsync<MatchActionResponse>(JsonOptions);
        Assert.True(againBody!.Success);
        Assert.False(againBody.IsMutualMatch);

        var otherClient = factory.CreateClient();
        otherClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", otherToken);
        var mutualBody = await (await otherClient.PostAsync($"/api/matches/{me}/connect", null))
            .Content.ReadFromJsonAsync<MatchActionResponse>(JsonOptions);
        Assert.True(mutualBody!.IsMutualMatch);
        Assert.NotNull(mutualBody.ConnectionId);

        var mutualAgainBody = await (await otherClient.PostAsync($"/api/matches/{me}/connect", null))
            .Content.ReadFromJsonAsync<MatchActionResponse>(JsonOptions);
        Assert.Equal(mutualBody.ConnectionId, mutualAgainBody!.ConnectionId);

        using var verifyScope = factory.Services.CreateScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();
        var count = await verifyDb.Connections.CountAsync(c =>
            (c.UserAId == me && c.UserBId == otherId) || (c.UserAId == otherId && c.UserBId == me));
        Assert.Equal(1, count);
    }

    [Fact]
    public async Task Pagination_does_not_repeat_candidates()
    {
        await using var factory = new MatchmakingWebAppFactory();
        var (client, _) = await SeedAndAuthAsync(factory, async (db, _) =>
        {
            for (var i = 0; i < 8; i++)
            {
                db.Users.Add(BuildUser($"Page {i}", $"page{i}", "tennis", "Intermediate", -33.86 - i * 0.001, 151.21));
            }
            await db.SaveChangesAsync();
        });

        var page1 = await client.GetFromJsonAsync<MatchCandidatesResponse>(
            "/api/matches/candidates?latitude=-33.86&longitude=151.21&pageSize=3", JsonOptions);
        Assert.Equal(3, page1!.Items.Count);
        Assert.False(string.IsNullOrEmpty(page1.NextCursor));

        var page2 = await client.GetFromJsonAsync<MatchCandidatesResponse>(
            $"/api/matches/candidates?latitude=-33.86&longitude=151.21&pageSize=3&cursor={Uri.EscapeDataString(page1.NextCursor!)}",
            JsonOptions);

        var ids1 = page1.Items.Select(i => i.UserId).ToHashSet();
        Assert.DoesNotContain(page2!.Items, i => ids1.Contains(i.UserId));
    }

    private static async Task<(HttpClient Client, Guid UserId)> SeedAndAuthAsync(
        MatchmakingWebAppFactory factory,
        Func<AppDbContext, Guid, Task>? seedExtra = null)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.EnsureCreatedAsync();

        var me = BuildUser("Me User", "meuser_" + Guid.NewGuid().ToString("N")[..8], "tennis", "Intermediate", -33.8688, 151.2093);
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

    private static User BuildUser(
        string displayName,
        string username,
        string sport,
        string skill,
        double lat,
        double lng)
    {
        return new User
        {
            Id = Guid.NewGuid(),
            FirstName = displayName.Split(' ')[0],
            LastName = "Test",
            DisplayName = displayName,
            Username = username,
            Email = $"{username}@example.com",
            PasswordHash = "hash",
            DateOfBirth = new DateOnly(1995, 1, 1),
            Sex = "unspecified",
            PreferredSports = UserMapper.SerializePreferredSports([sport]),
            SkillLevel = skill,
            Latitude = lat,
            Longitude = lng,
            LocationUpdatedAt = DateTime.UtcNow,
            IsActive = true,
            IsPrivate = false,
            CreatedAt = DateTime.UtcNow
        };
    }
}
