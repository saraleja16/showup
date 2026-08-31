using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
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

public class PortfolioWebAppFactory : WebApplicationFactory<Program>
{
    public string DbName { get; } = "PortfolioTests_" + Guid.NewGuid();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        Environment.SetEnvironmentVariable("Jwt__Key", "TEST_JWT_SIGNING_KEY_32_CHARS_MIN_OK!!");

        builder.ConfigureServices(services =>
        {
            services.RemoveAll(typeof(DbContextOptions<AppDbContext>));
            services.RemoveAll(typeof(AppDbContext));
            services.AddDbContext<AppDbContext>(options => options.UseInMemoryDatabase(DbName));
            services.RemoveAll<INotificationService>();
            services.AddSingleton<INotificationService, NoOpNotificationService>();
        });
    }
}

public class ProfilePortfolioTests
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    private static User User(string name, string username) => new()
    {
        Id = Guid.NewGuid(),
        Email = $"{username}@example.com",
        Username = username,
        DisplayName = name,
        FirstName = name.Split(' ')[0],
        LastName = name.Contains(' ') ? name.Split(' ')[^1] : "User",
        PasswordHash = new PasswordHasher<User>().HashPassword(null!, "CorrectHorseBattery1!"),
        PreferredSports = UserMapper.SerializePreferredSports(["tennis"]),
        SkillLevel = "Intermediate",
        IsActive = true,
        CreatedAt = DateTime.UtcNow
    };

    private static Event Ev(Guid hostId, string sport, DateTime start, string title = "match") => new()
    {
        Id = Guid.NewGuid(),
        Title = title,
        Description = "d",
        CreatorId = hostId,
        Latitude = -33.86,
        Longitude = 151.21,
        ScheduledAt = start,
        MaxPlayers = 2,
        Sport = sport,
        SportDetails = """{"sessionType":"match","durationMinutes":60}""",
        CreatedAt = DateTime.UtcNow
    };

    private static EventParticipant Part(Guid eventId, Guid userId, ParticipationStatus status) => new()
    {
        Id = Guid.NewGuid(),
        EventId = eventId,
        UserId = userId,
        JoinedAt = DateTime.UtcNow.AddHours(-2),
        Status = status,
        StatusUpdatedAt = DateTime.UtcNow.AddHours(-1),
        VerificationMethod = status == ParticipationStatus.Attended
            ? AttendanceVerificationMethod.AutomaticLocation
            : null
    };

    private static EventResult ConfirmedResult(Guid eventId, string sport, string json, int? a = null, int? b = null, int? ua = null, int? ub = null) => new()
    {
        Id = Guid.NewGuid(),
        EventId = eventId,
        Sport = sport,
        ScoreJson = json,
        Status = EventResultStatus.Confirmed,
        SubmittedByUserId = Guid.NewGuid(),
        SubmittedAt = DateTime.UtcNow.AddHours(-1),
        ConfirmedByUserId = Guid.NewGuid(),
        ConfirmedAt = DateTime.UtcNow.AddMinutes(-30),
        ScoreA = a,
        ScoreB = b,
        UnitsWonA = ua,
        UnitsWonB = ub,
        Summary = "ok"
    };

    [Fact]
    public async Task GamesPlayed_completed_present_counted_absent_and_future_not()
    {
        await using var factory = new PortfolioWebAppFactory();
        var host = User("Host One", "h1_" + Guid.NewGuid().ToString("N")[..6]);
        var guest = User("Guest One", "g1_" + Guid.NewGuid().ToString("N")[..6]);
        var completed = Ev(host.Id, "tennis", DateTime.UtcNow.AddHours(-3), "done");
        var absentGame = Ev(host.Id, "tennis", DateTime.UtcNow.AddHours(-4), "absent");
        var future = Ev(host.Id, "tennis", DateTime.UtcNow.AddDays(1), "future");

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Users.AddRange(host, guest);
            db.Events.AddRange(completed, absentGame, future);
            db.EventParticipants.AddRange(
                Part(completed.Id, guest.Id, ParticipationStatus.Attended),
                Part(absentGame.Id, guest.Id, ParticipationStatus.NoShow),
                Part(future.Id, guest.Id, ParticipationStatus.Registered));
            db.EventResults.AddRange(
                ConfirmedResult(completed.Id, "tennis",
                    """{"sets":[{"sideA":6,"sideB":4},{"sideA":6,"sideB":2}]}""", ua: 2, ub: 0),
                ConfirmedResult(absentGame.Id, "tennis",
                    """{"sets":[{"sideA":6,"sideB":1},{"sideA":6,"sideB":0}]}""", ua: 2, ub: 0));
            await db.SaveChangesAsync();
        }

        var client = factory.CreateClient();
        var portfolio = await client.GetFromJsonAsync<ProfilePortfolioResponse>(
            $"/api/profile/{guest.Id}/portfolio", JsonOptions);

        Assert.NotNull(portfolio);
        Assert.Equal(1, portfolio.Stats.GamesPlayed);
        Assert.Equal(1, portfolio.Stats.UpcomingCount);
        Assert.Single(portfolio.Played);
        Assert.Equal(completed.Id, portfolio.Played[0].EventId);
        Assert.DoesNotContain(portfolio.Played, g => g.EventId == absentGame.Id);
        Assert.DoesNotContain(portfolio.Played, g => g.EventId == future.Id);
    }

    [Fact]
    public async Task GamesPlayed_rejected_cancelled_not_counted()
    {
        await using var factory = new PortfolioWebAppFactory();
        var host = User("Host Two", "h2_" + Guid.NewGuid().ToString("N")[..6]);
        var guest = User("Guest Two", "g2_" + Guid.NewGuid().ToString("N")[..6]);
        var ev = Ev(host.Id, "soccer", DateTime.UtcNow.AddHours(-3));

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Users.AddRange(host, guest);
            db.Events.Add(ev);
            db.EventParticipants.Add(Part(ev.Id, guest.Id, ParticipationStatus.CancelledEarly));
            db.EventResults.Add(ConfirmedResult(ev.Id, "soccer", """{"scoreA":1,"scoreB":0}""", a: 1, b: 0));
            await db.SaveChangesAsync();
        }

        var client = factory.CreateClient();
        var portfolio = await client.GetFromJsonAsync<ProfilePortfolioResponse>(
            $"/api/profile/{guest.Id}/portfolio", JsonOptions);
        Assert.Equal(0, portfolio!.Stats.GamesPlayed);
    }

    [Fact]
    public async Task GamesHosted_counts_own_events_only_including_upcoming()
    {
        await using var factory = new PortfolioWebAppFactory();
        var host = User("Host Three", "h3_" + Guid.NewGuid().ToString("N")[..6]);
        var other = User("Other Host", "oh_" + Guid.NewGuid().ToString("N")[..6]);
        var minePast = Ev(host.Id, "tennis", DateTime.UtcNow.AddHours(-2));
        var mineFuture = Ev(host.Id, "tennis", DateTime.UtcNow.AddDays(2));
        var theirs = Ev(other.Id, "tennis", DateTime.UtcNow.AddHours(-2));

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Users.AddRange(host, other);
            db.Events.AddRange(minePast, mineFuture, theirs);
            await db.SaveChangesAsync();
        }

        var client = factory.CreateClient();
        var portfolio = await client.GetFromJsonAsync<ProfilePortfolioResponse>(
            $"/api/profile/{host.Id}/portfolio", JsonOptions);

        Assert.Equal(2, portfolio!.Stats.GamesHosted);
        Assert.Equal(2, portfolio.Hosted.Count);
        Assert.DoesNotContain(portfolio.Hosted, g => g.EventId == theirs.Id);

        var profile = await client.GetFromJsonAsync<ProfileDto>($"/api/profile/{host.Id}", JsonOptions);
        Assert.Equal(portfolio.Stats.GamesHosted, profile!.Stats.GamesHosted);
    }

    [Fact]
    public async Task Upcoming_live_counted_completed_not()
    {
        await using var factory = new PortfolioWebAppFactory();
        var host = User("Host Four", "h4_" + Guid.NewGuid().ToString("N")[..6]);
        var guest = User("Guest Four", "g4_" + Guid.NewGuid().ToString("N")[..6]);
        var live = Ev(host.Id, "tennis", DateTime.UtcNow.AddMinutes(-10), "live");
        var done = Ev(host.Id, "tennis", DateTime.UtcNow.AddHours(-3), "done");

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Users.AddRange(host, guest);
            db.Events.AddRange(live, done);
            db.EventParticipants.AddRange(
                Part(live.Id, guest.Id, ParticipationStatus.Registered),
                Part(done.Id, guest.Id, ParticipationStatus.Attended));
            db.EventResults.Add(ConfirmedResult(done.Id, "tennis",
                """{"sets":[{"sideA":6,"sideB":4},{"sideA":6,"sideB":3}]}""", ua: 2, ub: 0));
            await db.SaveChangesAsync();
        }

        var client = factory.CreateClient();
        var page = await client.GetFromJsonAsync<PortfolioGamesPageResponse>(
            $"/api/profile/{guest.Id}/games?type=upcoming", JsonOptions);

        Assert.NotNull(page);
        Assert.Equal(1, page.Total);
        Assert.Equal(EventLifecycleStatus.Live, page.Items[0].EventStatus);
        Assert.DoesNotContain(page.Items, i => i.EventId == done.Id);
    }

    [Fact]
    public async Task Tennis_portfolio_returns_both_player_identities_and_sets()
    {
        await using var factory = new PortfolioWebAppFactory();
        var host = User("Sara Cubillos", "sara_" + Guid.NewGuid().ToString("N")[..6]);
        var guest = User("Goraksha", "gora_" + Guid.NewGuid().ToString("N")[..6]);
        var ev = Ev(host.Id, "tennis", DateTime.UtcNow.AddHours(-3));

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Users.AddRange(host, guest);
            db.Events.Add(ev);
            db.EventParticipants.AddRange(
                Part(ev.Id, host.Id, ParticipationStatus.Attended),
                Part(ev.Id, guest.Id, ParticipationStatus.Attended));
            db.EventResults.Add(ConfirmedResult(ev.Id, "tennis",
                """{"sets":[{"sideA":6,"sideB":4},{"sideA":3,"sideB":6},{"sideA":6,"sideB":2}]}""",
                ua: 2, ub: 1));
            await db.SaveChangesAsync();
        }

        var client = factory.CreateClient();
        var portfolio = await client.GetFromJsonAsync<ProfilePortfolioResponse>(
            $"/api/profile/{guest.Id}/portfolio", JsonOptions);

        var card = Assert.Single(portfolio!.Played);
        Assert.NotNull(card.SideA);
        Assert.NotNull(card.SideB);
        Assert.Contains(card.SideA!.Participants, p => p.DisplayName == "Sara Cubillos");
        Assert.Contains(card.SideB!.Participants, p => p.DisplayName == "Goraksha");
        Assert.Equal(3, card.Result!.Sets!.Count);
        Assert.Equal(2, card.Result.SideAWins);
        Assert.Equal(1, card.Result.SideBWins);
        Assert.Equal(EventResultStatus.Confirmed, card.Result.Status);
        Assert.Equal("B", card.UserSide);
        Assert.Equal(PortfolioUserOutcome.Loss, card.UserOutcome);
        Assert.DoesNotContain("Side B", card.SideB.Participants.Select(p => p.DisplayName));
    }

    [Fact]
    public async Task Pickleball_soccer_volleyball_score_shapes()
    {
        await using var factory = new PortfolioWebAppFactory();
        var host = User("Host Sport", "hs_" + Guid.NewGuid().ToString("N")[..6]);
        var guest = User("Guest Sport", "gs_" + Guid.NewGuid().ToString("N")[..6]);
        var pb = Ev(host.Id, "pickleball", DateTime.UtcNow.AddHours(-3), "pb");
        var soccer = Ev(host.Id, "soccer", DateTime.UtcNow.AddHours(-3), "soccer");
        soccer.SportDetails = null;
        var vb = Ev(host.Id, "volleyball", DateTime.UtcNow.AddHours(-3), "vb");

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Users.AddRange(host, guest);
            db.Events.AddRange(pb, soccer, vb);
            foreach (var e in new[] { pb, soccer, vb })
            {
                db.EventParticipants.AddRange(
                    Part(e.Id, host.Id, ParticipationStatus.Attended),
                    Part(e.Id, guest.Id, ParticipationStatus.Attended));
            }

            db.EventResults.AddRange(
                ConfirmedResult(pb.Id, "pickleball",
                    """{"games":[{"sideA":11,"sideB":7},{"sideA":8,"sideB":11},{"sideA":11,"sideB":9}]}""",
                    ua: 2, ub: 1),
                ConfirmedResult(soccer.Id, "soccer", """{"scoreA":3,"scoreB":2}""", a: 3, b: 2),
                ConfirmedResult(vb.Id, "volleyball",
                    """{"sets":[{"sideA":25,"sideB":21},{"sideA":22,"sideB":25},{"sideA":25,"sideB":18}]}""",
                    ua: 2, ub: 1));
            await db.SaveChangesAsync();
        }

        var client = factory.CreateClient();
        var page = await client.GetFromJsonAsync<PortfolioGamesPageResponse>(
            $"/api/profile/{guest.Id}/games?type=played&pageSize=10", JsonOptions);

        Assert.Equal(3, page!.Total);
        var pbCard = page.Items.Single(i => i.Sport == "pickleball");
        Assert.NotNull(pbCard.Result!.Games);
        Assert.Equal(3, pbCard.Result.Games!.Count);
        Assert.Contains(pbCard.SideB!.Participants, p => p.UserId == guest.Id);

        var soccerCard = page.Items.Single(i => i.Sport == "soccer");
        Assert.Equal(3, soccerCard.Result!.ScoreA);
        Assert.Equal(2, soccerCard.Result.ScoreB);

        var vbCard = page.Items.Single(i => i.Sport == "volleyball");
        Assert.Equal(3, vbCard.Result!.Sets!.Count);
        Assert.Equal(2, vbCard.Result.SideAWins);
    }

    [Fact]
    public async Task Result_status_pending_and_disputed_expose_pending_outcome()
    {
        await using var factory = new PortfolioWebAppFactory();
        var host = User("Host Pend", "hp_" + Guid.NewGuid().ToString("N")[..6]);
        var guest = User("Guest Pend", "gp_" + Guid.NewGuid().ToString("N")[..6]);
        var pendingEv = Ev(host.Id, "tennis", DateTime.UtcNow.AddHours(-3), "pending");
        var disputedEv = Ev(host.Id, "tennis", DateTime.UtcNow.AddHours(-4), "disputed");

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Users.AddRange(host, guest);
            db.Events.AddRange(pendingEv, disputedEv);
            foreach (var e in new[] { pendingEv, disputedEv })
            {
                db.EventParticipants.AddRange(
                    Part(e.Id, host.Id, ParticipationStatus.Attended),
                    Part(e.Id, guest.Id, ParticipationStatus.Attended));
            }

            db.EventResults.Add(new EventResult
            {
                Id = Guid.NewGuid(),
                EventId = pendingEv.Id,
                Sport = "tennis",
                ScoreJson = """{"sets":[{"sideA":6,"sideB":4},{"sideA":6,"sideB":2}]}""",
                Status = EventResultStatus.PendingConfirmation,
                SubmittedByUserId = host.Id,
                SubmittedAt = DateTime.UtcNow,
                UnitsWonA = 2,
                UnitsWonB = 0,
                Summary = "pending"
            });
            db.EventResults.Add(new EventResult
            {
                Id = Guid.NewGuid(),
                EventId = disputedEv.Id,
                Sport = "tennis",
                ScoreJson = """{"sets":[{"sideA":6,"sideB":4},{"sideA":6,"sideB":2}]}""",
                Status = EventResultStatus.Disputed,
                SubmittedByUserId = host.Id,
                SubmittedAt = DateTime.UtcNow,
                DisputedByUserId = guest.Id,
                DisputedAt = DateTime.UtcNow,
                UnitsWonA = 2,
                UnitsWonB = 0,
                Summary = "disputed"
            });
            await db.SaveChangesAsync();
        }

        var client = factory.CreateClient();
        // Not Completed lifecycle → not in played; use hosted for host.
        var hosted = await client.GetFromJsonAsync<PortfolioGamesPageResponse>(
            $"/api/profile/{host.Id}/games?type=hosted", JsonOptions);

        var pendingCard = hosted!.Items.Single(i => i.EventId == pendingEv.Id);
        Assert.Equal(EventResultStatus.PendingConfirmation, pendingCard.Result!.Status);
        Assert.Equal(PortfolioUserOutcome.Pending, pendingCard.UserOutcome);
        Assert.Equal(EventLifecycleStatus.ResultPending, pendingCard.EventStatus);

        var disputedCard = hosted.Items.Single(i => i.EventId == disputedEv.Id);
        Assert.Equal(EventResultStatus.Disputed, disputedCard.Result!.Status);
        Assert.Equal(PortfolioUserOutcome.Pending, disputedCard.UserOutcome);
    }

    [Fact]
    public async Task Profile_stats_match_portfolio_and_me_requires_auth()
    {
        await using var factory = new PortfolioWebAppFactory();
        var host = User("Host Auth", "ha_" + Guid.NewGuid().ToString("N")[..6]);
        var guest = User("Guest Auth", "ga_" + Guid.NewGuid().ToString("N")[..6]);
        var ev = Ev(host.Id, "tennis", DateTime.UtcNow.AddHours(-3));

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Users.AddRange(host, guest);
            db.Events.Add(ev);
            db.EventParticipants.AddRange(
                Part(ev.Id, host.Id, ParticipationStatus.Attended),
                Part(ev.Id, guest.Id, ParticipationStatus.Attended));
            db.EventResults.Add(ConfirmedResult(ev.Id, "tennis",
                """{"sets":[{"sideA":6,"sideB":4},{"sideA":6,"sideB":2}]}""", ua: 2, ub: 0));
            await db.SaveChangesAsync();
        }

        var client = factory.CreateClient();
        var profile = await client.GetFromJsonAsync<ProfileDto>($"/api/profile/{guest.Id}", JsonOptions);
        var portfolio = await client.GetFromJsonAsync<ProfilePortfolioResponse>(
            $"/api/profile/{guest.Id}/portfolio", JsonOptions);

        Assert.Equal(portfolio!.Stats.GamesPlayed, profile!.Stats.GamesPlayed);
        Assert.Equal(portfolio.Stats.GamesHosted, profile.Stats.GamesHosted);
        Assert.Equal(portfolio.Stats.UpcomingCount, profile.Stats.UpcomingCount);

        var unauth = await client.GetAsync("/api/users/me/portfolio");
        Assert.Equal(HttpStatusCode.Unauthorized, unauth.StatusCode);

        // Authenticate as guest.
        var login = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = guest.Email,
            password = "CorrectHorseBattery1!"
        });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        using var loginDoc = JsonDocument.Parse(await login.Content.ReadAsStringAsync());
        var token = loginDoc.RootElement.GetProperty("accessToken").GetString();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var me = await client.GetFromJsonAsync<ProfilePortfolioResponse>("/api/users/me/portfolio", JsonOptions);
        Assert.Equal(portfolio.Stats.GamesPlayed, me!.Stats.GamesPlayed);
    }

    [Fact]
    public async Task Portfolio_does_not_leak_coordinates()
    {
        await using var factory = new PortfolioWebAppFactory();
        var host = User("Host Priv", "hpr_" + Guid.NewGuid().ToString("N")[..6]);
        var guest = User("Guest Priv", "gpr_" + Guid.NewGuid().ToString("N")[..6]);
        var ev = Ev(host.Id, "tennis", DateTime.UtcNow.AddHours(-3));

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Users.AddRange(host, guest);
            db.Events.Add(ev);
            db.EventParticipants.AddRange(
                Part(ev.Id, host.Id, ParticipationStatus.Attended),
                Part(ev.Id, guest.Id, ParticipationStatus.Attended));
            db.EventResults.Add(ConfirmedResult(ev.Id, "tennis",
                """{"sets":[{"sideA":6,"sideB":4},{"sideA":6,"sideB":2}]}""", ua: 2, ub: 0));
            await db.SaveChangesAsync();
        }

        var client = factory.CreateClient();
        var raw = await client.GetStringAsync($"/api/profile/{guest.Id}/portfolio");
        Assert.DoesNotContain("latitude", raw, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("longitude", raw, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("DistanceMeters", raw, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(guest.Email, raw, StringComparison.OrdinalIgnoreCase);
    }
}
