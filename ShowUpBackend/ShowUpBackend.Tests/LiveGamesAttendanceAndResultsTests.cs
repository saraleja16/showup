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

public class LiveGamesWebAppFactory : WebApplicationFactory<Program>
{
    public string DbName { get; } = "LiveGamesTests_" + Guid.NewGuid();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        Environment.SetEnvironmentVariable("Jwt__Key", "TEST_JWT_SIGNING_KEY_32_CHARS_MIN_OK!!");
        builder.UseSetting("CheckIn:WindowOpenMinutes", "60");
        builder.UseSetting("CheckIn:WindowCloseMinutes", "120");
        builder.UseSetting("CheckIn:RadiusMeters", "200");
        builder.UseSetting("Attendance:MinutesBeforeStart", "60");
        builder.UseSetting("Attendance:MinutesAfterStart", "120");
        builder.UseSetting("Attendance:MinutesAfterEnd", "180");
        builder.UseSetting("Attendance:CheckInRadiusMeters", "200");

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

public class LiveGamesAttendanceAndResultsTests
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

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

    private static async Task<(HttpClient HostClient, HttpClient GuestClient, User Host, User Guest, Event Ev)> SeedMatchAsync(
        LiveGamesWebAppFactory factory,
        string sport = "tennis",
        DateTime? scheduledAt = null,
        double lat = -33.8688,
        double lng = 151.2093)
    {
        var host = BuildUser("Host Player", "host_" + Guid.NewGuid().ToString("N")[..8]);
        var guest = BuildUser("Guest Player", "guest_" + Guid.NewGuid().ToString("N")[..8]);
        var start = scheduledAt ?? DateTime.UtcNow.AddMinutes(-5);
        var ev = new Event
        {
            Id = Guid.NewGuid(),
            Title = $"{sport} match",
            Description = "test",
            CreatorId = host.Id,
            Latitude = lat,
            Longitude = lng,
            ScheduledAt = start,
            MaxPlayers = 2,
            Sport = sport,
            SportDetails = """{"sessionType":"match","durationMinutes":60}""",
            CreatedAt = DateTime.UtcNow
        };

        HttpClient hostClient, guestClient;
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

            hostClient = factory.CreateClient();
            hostClient.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", tokens.CreateAccessToken(host));
            guestClient = factory.CreateClient();
            guestClient.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", tokens.CreateAccessToken(guest));
        }

        return (hostClient, guestClient, host, guest, ev);
    }

    [Fact]
    public async Task CheckIn_within_radius_marks_present_automatic_location()
    {
        await using var factory = new LiveGamesWebAppFactory();
        var (_, guestClient, _, guest, ev) = await SeedMatchAsync(factory);

        var response = await guestClient.PostAsJsonAsync($"/api/events/{ev.Id}/checkin", new
        {
            userId = guest.Id,
            latitude = ev.Latitude,
            longitude = ev.Longitude,
            accuracyMeters = 8.0
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<CheckInResponse>(JsonOptions);
        Assert.NotNull(body);
        Assert.Equal(LiveAttendanceStatus.Present, body.AttendanceStatus);
        Assert.Equal(AttendanceVerificationMethod.AutomaticLocation, body.VerificationMethod);
        Assert.True(body.DistanceMeters <= 200);
    }

    [Fact]
    public async Task CheckIn_outside_radius_rejected()
    {
        await using var factory = new LiveGamesWebAppFactory();
        var (_, guestClient, _, guest, ev) = await SeedMatchAsync(factory);

        var response = await guestClient.PostAsJsonAsync($"/api/events/{ev.Id}/checkin", new
        {
            userId = guest.Id,
            latitude = ev.Latitude + 0.05,
            longitude = ev.Longitude
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task CheckIn_non_participant_rejected()
    {
        await using var factory = new LiveGamesWebAppFactory();
        var (_, _, _, _, ev) = await SeedMatchAsync(factory);
        var stranger = BuildUser("Stranger", "stranger_" + Guid.NewGuid().ToString("N")[..8]);
        string strangerToken;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var tokens = scope.ServiceProvider.GetRequiredService<ITokenService>();
            db.Users.Add(stranger);
            await db.SaveChangesAsync();
            strangerToken = tokens.CreateAccessToken(stranger);
        }
        var strangerClient = factory.CreateClient();
        strangerClient.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", strangerToken);

        var response = await strangerClient.PostAsJsonAsync($"/api/events/{ev.Id}/checkin", new
        {
            userId = stranger.Id,
            latitude = ev.Latitude,
            longitude = ev.Longitude
        });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Host_manual_present_sets_host_manual_verification()
    {
        await using var factory = new LiveGamesWebAppFactory();
        var (hostClient, _, host, guest, ev) = await SeedMatchAsync(factory);

        var response = await hostClient.PostAsJsonAsync($"/api/events/{ev.Id}/attendance/manual", new
        {
            hostUserId = host.Id,
            targetUserId = guest.Id,
            status = "Present"
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<ManualAttendanceResponse>(JsonOptions);
        Assert.NotNull(body);
        Assert.Equal(LiveAttendanceStatus.Present, body.AttendanceStatus);
        Assert.Equal(AttendanceVerificationMethod.HostManual, body.VerificationMethod);
        Assert.Equal(host.Id, body.VerifiedByUserId);
    }

    [Fact]
    public async Task Non_host_manual_attendance_forbidden()
    {
        await using var factory = new LiveGamesWebAppFactory();
        var (_, guestClient, _, guest, ev) = await SeedMatchAsync(factory);

        var response = await guestClient.PostAsJsonAsync($"/api/events/{ev.Id}/attendance/manual", new
        {
            hostUserId = guest.Id,
            targetUserId = guest.Id,
            status = "Present"
        });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Duplicate_checkin_is_idempotent()
    {
        await using var factory = new LiveGamesWebAppFactory();
        var (_, guestClient, _, guest, ev) = await SeedMatchAsync(factory);

        var first = await guestClient.PostAsJsonAsync($"/api/events/{ev.Id}/checkin", new
        {
            userId = guest.Id,
            latitude = ev.Latitude,
            longitude = ev.Longitude
        });
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        var second = await guestClient.PostAsJsonAsync($"/api/events/{ev.Id}/checkin", new
        {
            userId = guest.Id,
            latitude = ev.Latitude,
            longitude = ev.Longitude
        });
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        var body = await second.Content.ReadFromJsonAsync<CheckInResponse>(JsonOptions);
        Assert.Equal(LiveAttendanceStatus.Present, body!.AttendanceStatus);
    }

    [Fact]
    public async Task Live_endpoint_returns_counts_without_private_coordinates()
    {
        await using var factory = new LiveGamesWebAppFactory();
        var (hostClient, _, host, guest, ev) = await SeedMatchAsync(factory);

        await hostClient.PostAsJsonAsync($"/api/events/{ev.Id}/attendance/manual", new
        {
            hostUserId = host.Id,
            targetUserId = guest.Id,
            status = "Present"
        });

        // GET live is [AllowAnonymous] — use an unauthenticated client to verify public access.
        var anonClient = factory.CreateClient();
        var response = await anonClient.GetAsync($"/api/events/{ev.Id}/live");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var live = await response.Content.ReadFromJsonAsync<LiveEventResponse>(JsonOptions);
        Assert.NotNull(live);
        Assert.Equal(2, live.ParticipantCount);
        Assert.Equal(1, live.PresentCount);
        Assert.Equal(EventLifecycleStatus.Live, live.Status);
        var json = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("latitude", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("longitude", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Result_submit_confirm_and_prevent_conflicting_confirmed()
    {
        await using var factory = new LiveGamesWebAppFactory();
        // Results endpoints read userId from request body; any authenticated client works.
        var (hostClient, _, host, guest, ev) = await SeedMatchAsync(factory, "soccer");

        var submit = await hostClient.PostAsJsonAsync($"/api/events/{ev.Id}/results", new
        {
            submittedByUserId = host.Id,
            scoreA = 3,
            scoreB = 2
        });
        Assert.Equal(HttpStatusCode.OK, submit.StatusCode);
        var pending = await submit.Content.ReadFromJsonAsync<EventResultSummaryDto>(JsonOptions);
        Assert.Equal(EventResultStatus.PendingConfirmation, pending!.Status);

        var confirm = await hostClient.PostAsJsonAsync($"/api/events/{ev.Id}/results/confirm", new
        {
            confirmedByUserId = guest.Id
        });
        Assert.Equal(HttpStatusCode.OK, confirm.StatusCode);

        var resubmit = await hostClient.PostAsJsonAsync($"/api/events/{ev.Id}/results", new
        {
            submittedByUserId = guest.Id,
            scoreA = 1,
            scoreB = 0
        });
        Assert.Equal(HttpStatusCode.Conflict, resubmit.StatusCode);
    }

    [Fact]
    public async Task Result_dispute_keeps_original_and_marks_disputed()
    {
        await using var factory = new LiveGamesWebAppFactory();
        var (hostClient, _, host, guest, ev) = await SeedMatchAsync(factory, "soccer");

        await hostClient.PostAsJsonAsync($"/api/events/{ev.Id}/results", new
        {
            submittedByUserId = host.Id,
            scoreA = 2,
            scoreB = 2
        });

        var dispute = await hostClient.PostAsJsonAsync($"/api/events/{ev.Id}/results/dispute", new
        {
            disputedByUserId = guest.Id,
            reason = "Wrong score"
        });
        Assert.Equal(HttpStatusCode.OK, dispute.StatusCode);
        var body = await dispute.Content.ReadFromJsonAsync<EventResultSummaryDto>(JsonOptions);
        Assert.Equal(EventResultStatus.Disputed, body!.Status);
        Assert.Equal(2, body.ScoreA);
        Assert.Equal(2, body.ScoreB);
        Assert.Equal(guest.Id, body.DisputedByUserId);
    }

    [Fact]
    public async Task Profile_upcoming_and_games_played_reflect_completion()
    {
        await using var factory = new LiveGamesWebAppFactory();
        var host = BuildUser("Profile Host", "phost_" + Guid.NewGuid().ToString("N")[..8]);
        var guest = BuildUser("Profile Guest", "pguest_" + Guid.NewGuid().ToString("N")[..8]);
        var past = new Event
        {
            Id = Guid.NewGuid(),
            Title = "Past tennis",
            Description = "d",
            CreatorId = host.Id,
            Latitude = -33.86,
            Longitude = 151.21,
            ScheduledAt = DateTime.UtcNow.AddHours(-3),
            MaxPlayers = 2,
            Sport = "tennis",
            SportDetails = """{"sessionType":"match","durationMinutes":60}""",
            CreatedAt = DateTime.UtcNow
        };
        var future = new Event
        {
            Id = Guid.NewGuid(),
            Title = "Future tennis",
            Description = "d",
            CreatorId = host.Id,
            Latitude = -33.86,
            Longitude = 151.21,
            ScheduledAt = DateTime.UtcNow.AddDays(2),
            MaxPlayers = 2,
            Sport = "tennis",
            SportDetails = """{"sessionType":"match","durationMinutes":60}""",
            CreatedAt = DateTime.UtcNow
        };

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Users.AddRange(host, guest);
            db.Events.AddRange(past, future);
            db.EventParticipants.AddRange(
                new EventParticipant
                {
                    Id = Guid.NewGuid(),
                    EventId = past.Id,
                    UserId = guest.Id,
                    JoinedAt = DateTime.UtcNow.AddHours(-4),
                    Status = ParticipationStatus.Attended,
                    StatusUpdatedAt = DateTime.UtcNow.AddHours(-3)
                },
                new EventParticipant
                {
                    Id = Guid.NewGuid(),
                    EventId = future.Id,
                    UserId = guest.Id,
                    JoinedAt = DateTime.UtcNow,
                    Status = ParticipationStatus.Registered
                });
            db.EventResults.Add(new EventResult
            {
                Id = Guid.NewGuid(),
                EventId = past.Id,
                Sport = "tennis",
                ScoreJson = """{"sets":[{"sideA":6,"sideB":4},{"sideA":6,"sideB":2}]}""",
                Status = EventResultStatus.Confirmed,
                SubmittedByUserId = host.Id,
                SubmittedAt = DateTime.UtcNow.AddHours(-2),
                ConfirmedByUserId = guest.Id,
                ConfirmedAt = DateTime.UtcNow.AddHours(-2),
                UnitsWonA = 2,
                UnitsWonB = 0,
                Summary = "6-4, 6-2 (2-0 sets)"
            });
            await db.SaveChangesAsync();
        }

        var client = factory.CreateClient();
        var profile = await client.GetFromJsonAsync<ProfileDto>($"/api/profile/{guest.Id}", JsonOptions);
        Assert.NotNull(profile);
        Assert.Equal(1, profile.Stats.UpcomingCount);
        Assert.Equal(1, profile.Stats.GamesPlayed);

        // Confirm future event completion reduces upcoming and increases played after attendance+confirm.
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var f = await db.Events.FirstAsync(e => e.Id == future.Id);
            f.ScheduledAt = DateTime.UtcNow.AddHours(-3);
            var p = await db.EventParticipants.FirstAsync(ep => ep.EventId == future.Id && ep.UserId == guest.Id);
            p.Status = ParticipationStatus.Attended;
            db.EventResults.Add(new EventResult
            {
                Id = Guid.NewGuid(),
                EventId = future.Id,
                Sport = "tennis",
                ScoreJson = """{"sets":[{"sideA":6,"sideB":3},{"sideA":6,"sideB":4}]}""",
                Status = EventResultStatus.Confirmed,
                SubmittedByUserId = host.Id,
                SubmittedAt = DateTime.UtcNow,
                ConfirmedByUserId = guest.Id,
                ConfirmedAt = DateTime.UtcNow,
                UnitsWonA = 2,
                UnitsWonB = 0,
                Summary = "done"
            });
            await db.SaveChangesAsync();
        }

        var after = await client.GetFromJsonAsync<ProfileDto>($"/api/profile/{guest.Id}", JsonOptions);
        Assert.NotNull(after);
        Assert.Equal(0, after.Stats.UpcomingCount);
        Assert.Equal(2, after.Stats.GamesPlayed);

        var hostProfile = await client.GetFromJsonAsync<ProfileDto>($"/api/profile/{host.Id}", JsonOptions);
        Assert.NotNull(hostProfile);
        Assert.Equal(2, hostProfile.Stats.GamesHosted);
    }
}
