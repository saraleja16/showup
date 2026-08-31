using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using ShowUpBackend.Data;
using ShowUpBackend.Helpers;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Models.Entities;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Tests;

public class EventResultPersistenceTests
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    [Fact]
    public async Task Soccer_submit_persists_and_get_returns_same_score()
    {
        await using var factory = new LiveGamesWebAppFactory();
        var (client, host, _, ev) = await SeedMatchAsync(factory, "soccer");

        var submit = await client.PostAsJsonAsync($"/api/events/{ev.Id}/results", new
        {
            submittedByUserId = host.Id,
            scoreA = 2,
            scoreB = 3
        });
        Assert.Equal(HttpStatusCode.OK, submit.StatusCode);
        var body = await submit.Content.ReadFromJsonAsync<EventResultSummaryDto>(JsonOptions);
        Assert.Equal(EventResultStatus.PendingConfirmation, body!.Status);
        Assert.Equal(ev.Id, body.EventId);
        Assert.Equal(2, body.ScoreA);
        Assert.Equal(3, body.ScoreB);
        Assert.Equal(host.Id, body.SubmittedByUserId);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var row = await db.EventResults.AsNoTracking().SingleAsync(r => r.EventId == ev.Id);
            Assert.Equal(body.ResultId, row.Id);
            Assert.Equal(2, row.ScoreA);
            Assert.Equal(3, row.ScoreB);
            Assert.Contains("scoreA", row.ScoreJson);
        }

        var get = await client.GetFromJsonAsync<EventResultSummaryDto>($"/api/events/{ev.Id}/results", JsonOptions);
        Assert.Equal(2, get!.ScoreA);
        Assert.Equal(3, get.ScoreB);
        Assert.Equal(body.ResultId, get.ResultId);

        var detail = await client.GetFromJsonAsync<EventDto>($"/api/events/{ev.Id}?userId={host.Id}", JsonOptions);
        Assert.NotNull(detail!.ResultSummary);
        Assert.Equal(2, detail.ResultSummary!.ScoreA);
        Assert.Equal(3, detail.ResultSummary.ScoreB);
        Assert.Equal(EventResultStatus.PendingConfirmation, detail.ResultSummary.Status);
    }

    [Fact]
    public async Task Duplicate_pending_submit_is_idempotent_and_does_not_overwrite()
    {
        await using var factory = new LiveGamesWebAppFactory();
        var (client, host, guest, ev) = await SeedMatchAsync(factory, "soccer");

        var first = await (await client.PostAsJsonAsync($"/api/events/{ev.Id}/results", new
        {
            submittedByUserId = host.Id,
            scoreA = 2,
            scoreB = 3
        })).Content.ReadFromJsonAsync<EventResultSummaryDto>(JsonOptions);

        var second = await client.PostAsJsonAsync($"/api/events/{ev.Id}/results", new
        {
            submittedByUserId = guest.Id,
            scoreA = 9,
            scoreB = 9
        });
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        var secondBody = await second.Content.ReadFromJsonAsync<EventResultSummaryDto>(JsonOptions);
        Assert.Equal(first!.ResultId, secondBody!.ResultId);
        Assert.Equal(2, secondBody.ScoreA);
        Assert.Equal(3, secondBody.ScoreB);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(1, await db.EventResults.CountAsync(r => r.EventId == ev.Id));
    }

    [Fact]
    public async Task Confirmed_result_is_immutable()
    {
        await using var factory = new LiveGamesWebAppFactory();
        var (client, host, guest, ev) = await SeedMatchAsync(factory, "soccer");

        await client.PostAsJsonAsync($"/api/events/{ev.Id}/results", new
        {
            submittedByUserId = host.Id,
            scoreA = 1,
            scoreB = 0
        });
        await client.PostAsJsonAsync($"/api/events/{ev.Id}/results/confirm", new
        {
            confirmedByUserId = guest.Id
        });

        var resubmit = await client.PostAsJsonAsync($"/api/events/{ev.Id}/results", new
        {
            submittedByUserId = guest.Id,
            scoreA = 5,
            scoreB = 5
        });
        Assert.Equal(HttpStatusCode.Conflict, resubmit.StatusCode);

        var get = await client.GetFromJsonAsync<EventResultSummaryDto>($"/api/events/{ev.Id}/results", JsonOptions);
        Assert.Equal(EventResultStatus.Confirmed, get!.Status);
        Assert.Equal(1, get.ScoreA);
        Assert.Equal(0, get.ScoreB);
    }

    [Fact]
    public async Task Dispute_retains_score_and_allows_amendment_resubmit()
    {
        await using var factory = new LiveGamesWebAppFactory();
        var (client, host, guest, ev) = await SeedMatchAsync(factory, "soccer");

        await client.PostAsJsonAsync($"/api/events/{ev.Id}/results", new
        {
            submittedByUserId = host.Id,
            scoreA = 2,
            scoreB = 2
        });
        var dispute = await client.PostAsJsonAsync($"/api/events/{ev.Id}/results/dispute", new
        {
            disputedByUserId = guest.Id,
            reason = "Wrong"
        });
        Assert.Equal(HttpStatusCode.OK, dispute.StatusCode);
        var disputed = await dispute.Content.ReadFromJsonAsync<EventResultSummaryDto>(JsonOptions);
        Assert.Equal(EventResultStatus.Disputed, disputed!.Status);
        Assert.Equal(2, disputed.ScoreA);

        var amend = await client.PostAsJsonAsync($"/api/events/{ev.Id}/results", new
        {
            submittedByUserId = guest.Id,
            scoreA = 3,
            scoreB = 1
        });
        Assert.Equal(HttpStatusCode.OK, amend.StatusCode);
        var amended = await amend.Content.ReadFromJsonAsync<EventResultSummaryDto>(JsonOptions);
        Assert.Equal(EventResultStatus.PendingConfirmation, amended!.Status);
        Assert.Equal(3, amended.ScoreA);
        Assert.Equal(1, amended.ScoreB);
        Assert.Equal(disputed.ResultId, amended.ResultId);
    }

    [Fact]
    public async Task Tennis_sets_persist_with_structure()
    {
        await using var factory = new LiveGamesWebAppFactory();
        var (client, host, _, ev) = await SeedMatchAsync(factory, "tennis");

        var submit = await client.PostAsJsonAsync($"/api/events/{ev.Id}/results", new
        {
            submittedByUserId = host.Id,
            sets = new[]
            {
                new { sideA = 6, sideB = 4 },
                new { sideA = 6, sideB = 3 }
            }
        });
        Assert.Equal(HttpStatusCode.OK, submit.StatusCode);
        var body = await submit.Content.ReadFromJsonAsync<EventResultSummaryDto>(JsonOptions);
        Assert.NotNull(body!.Sets);
        Assert.Equal(2, body.Sets!.Count);
        Assert.Equal(2, body.UnitsWonA);
        Assert.Equal(0, body.UnitsWonB);

        var get = await client.GetFromJsonAsync<EventResultSummaryDto>($"/api/events/{ev.Id}/results", JsonOptions);
        Assert.Equal(2, get!.Sets!.Count);
        Assert.Equal(6, get.Sets[0].SideA);
        Assert.Equal(4, get.Sets[0].SideB);
    }

    [Fact]
    public async Task Pickleball_games_alias_persists()
    {
        await using var factory = new LiveGamesWebAppFactory();
        var (client, host, _, ev) = await SeedMatchAsync(factory, "pickleball");

        var submit = await client.PostAsJsonAsync($"/api/events/{ev.Id}/results", new
        {
            submittedByUserId = host.Id,
            games = new[]
            {
                new { sideA = 11, sideB = 7 },
                new { sideA = 11, sideB = 9 }
            }
        });
        Assert.Equal(HttpStatusCode.OK, submit.StatusCode);
        var body = await submit.Content.ReadFromJsonAsync<EventResultSummaryDto>(JsonOptions);
        Assert.NotNull(body!.Games);
        Assert.Equal(2, body.Games!.Count);
        Assert.Equal(2, body.UnitsWonA);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var row = await db.EventResults.AsNoTracking().SingleAsync(r => r.EventId == ev.Id);
        Assert.Contains("games", row.ScoreJson);
    }

    [Fact]
    public async Task Volleyball_sets_persist()
    {
        await using var factory = new LiveGamesWebAppFactory();
        var (client, host, _, ev) = await SeedMatchAsync(factory, "volleyball");

        var submit = await client.PostAsJsonAsync($"/api/events/{ev.Id}/results", new
        {
            submittedByUserId = host.Id,
            sets = new[]
            {
                new { sideA = 25, sideB = 21 },
                new { sideA = 25, sideB = 20 }
            }
        });
        Assert.Equal(HttpStatusCode.OK, submit.StatusCode);
        var body = await submit.Content.ReadFromJsonAsync<EventResultSummaryDto>(JsonOptions);
        Assert.Equal(2, body!.Sets!.Count);
        Assert.Equal(2, body.UnitsWonA);
        Assert.Equal(0, body.UnitsWonB);

        var get = await client.GetFromJsonAsync<EventResultSummaryDto>($"/api/events/{ev.Id}/results", JsonOptions);
        Assert.Equal(25, get!.Sets![0].SideA);
        Assert.Equal(21, get.Sets[0].SideB);
    }

    [Fact]
    public async Task Portfolio_includes_saved_result_after_confirm()
    {
        await using var factory = new LiveGamesWebAppFactory();
        var (client, host, guest, ev) = await SeedMatchAsync(factory, "tennis",
            scheduledAt: DateTime.UtcNow.AddHours(-3));

        await client.PostAsJsonAsync($"/api/events/{ev.Id}/results", new
        {
            submittedByUserId = host.Id,
            sets = new[]
            {
                new { sideA = 6, sideB = 4 },
                new { sideA = 6, sideB = 2 }
            }
        });
        await client.PostAsJsonAsync($"/api/events/{ev.Id}/results/confirm", new
        {
            confirmedByUserId = guest.Id
        });

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            foreach (var p in db.EventParticipants.Where(p => p.EventId == ev.Id))
            {
                p.Status = ParticipationStatus.Attended;
                p.VerificationMethod = AttendanceVerificationMethod.HostManual;
            }
            await db.SaveChangesAsync();
        }

        var portfolio = await client.GetFromJsonAsync<ProfilePortfolioResponse>(
            $"/api/profile/{host.Id}/portfolio", JsonOptions);
        var card = portfolio!.Played.Concat(portfolio.Hosted).FirstOrDefault(c => c.EventId == ev.Id)
            ?? portfolio.UpcomingGames.FirstOrDefault(c => c.EventId == ev.Id);
        Assert.NotNull(card);
        Assert.NotNull(card!.Result);
        Assert.Equal(EventResultStatus.Confirmed, card.Result!.Status);
        Assert.Equal(2, card.Result.Sets!.Count);
        Assert.Equal(EventLifecycleStatus.Completed, card.EventStatus);
    }

    private static User BuildUser(string name, string username) => new()
    {
        Id = Guid.NewGuid(),
        Email = $"{username}@example.com",
        Username = username,
        DisplayName = name,
        FirstName = name.Split(' ')[0],
        LastName = name.Contains(' ') ? name.Split(' ')[1] : "User",
        PasswordHash = new PasswordHasher<User>().HashPassword(null!, "CorrectHorseBattery1!"),
        PreferredSports = UserMapper.SerializePreferredSports(["tennis"]),
        SkillLevel = "Intermediate",
        Latitude = -33.8688,
        Longitude = 151.2093,
        IsActive = true,
        CreatedAt = DateTime.UtcNow
    };

    private static async Task<(HttpClient Client, User Host, User Guest, Event Ev)> SeedMatchAsync(
        LiveGamesWebAppFactory factory,
        string sport = "tennis",
        DateTime? scheduledAt = null)
    {
        var host = BuildUser("Host Player", "host_" + Guid.NewGuid().ToString("N")[..8]);
        var guest = BuildUser("Guest Player", "guest_" + Guid.NewGuid().ToString("N")[..8]);
        var start = scheduledAt ?? DateTime.UtcNow.AddMinutes(-5);
        var duration = string.Equals(sport, "soccer", StringComparison.OrdinalIgnoreCase) ? 90 : 60;
        var ev = new Event
        {
            Id = Guid.NewGuid(),
            Title = $"{sport} match",
            Description = "test",
            CreatorId = host.Id,
            Latitude = -33.8688,
            Longitude = 151.2093,
            ScheduledAt = start,
            MaxPlayers = 2,
            Sport = sport,
            SportDetails = $"{{\"sessionType\":\"match\",\"durationMinutes\":{duration}}}",
            CreatedAt = DateTime.UtcNow
        };

        HttpClient client;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var tokens = scope.ServiceProvider.GetRequiredService<ITokenService>();
            db.Users.AddRange(host, guest);
            db.Events.Add(ev);
            db.EventParticipants.AddRange(
                new EventParticipant
                {
                    Id = Guid.NewGuid(),
                    EventId = ev.Id,
                    UserId = host.Id,
                    JoinedAt = DateTime.UtcNow,
                    Status = ParticipationStatus.Registered
                },
                new EventParticipant
                {
                    Id = Guid.NewGuid(),
                    EventId = ev.Id,
                    UserId = guest.Id,
                    JoinedAt = DateTime.UtcNow,
                    Status = ParticipationStatus.Registered
                });
            await db.SaveChangesAsync();

            // Results endpoints read userId from request body, not the JWT, so one
            // authenticated client is sufficient for all operations in these tests.
            client = factory.CreateClient();
            client.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", tokens.CreateAccessToken(host));
        }

        return (client, host, guest, ev);
    }
}
