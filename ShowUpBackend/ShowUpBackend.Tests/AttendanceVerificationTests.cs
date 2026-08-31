using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using ShowUpBackend.Data;
using ShowUpBackend.Helpers;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Models.Entities;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Tests;

public class AttendanceVerificationTests
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    [Fact]
    public async Task Auto_checkin_inside_radius_marks_present()
    {
        await using var factory = new LiveGamesWebAppFactory();
        var (_, guestClient, _, guest, ev) = await SeedAsync(factory);

        var response = await guestClient.PostAsJsonAsync($"/api/events/{ev.Id}/attendance/check-in", new
        {
            userId = guest.Id,
            latitude = ev.Latitude,
            longitude = ev.Longitude,
            accuracyMeters = 5
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<CheckInResponse>(JsonOptions);
        Assert.Equal(LiveAttendanceStatus.Present, body!.AttendanceStatus);
        Assert.Equal(AttendanceVerificationMethod.AutomaticLocation, body.VerificationMethod);
    }

    [Fact]
    public async Task Auto_checkin_outside_radius_rejected()
    {
        await using var factory = new LiveGamesWebAppFactory();
        var (_, guestClient, _, guest, ev) = await SeedAsync(factory);

        var response = await guestClient.PostAsJsonAsync($"/api/events/{ev.Id}/checkin", new
        {
            userId = guest.Id,
            latitude = ev.Latitude + 0.05,
            longitude = ev.Longitude
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Auto_checkin_invalid_coordinates_rejected()
    {
        await using var factory = new LiveGamesWebAppFactory();
        var (_, guestClient, _, guest, ev) = await SeedAsync(factory);

        var response = await guestClient.PostAsJsonAsync($"/api/events/{ev.Id}/checkin", new
        {
            userId = guest.Id,
            latitude = 999,
            longitude = 0
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Auto_checkin_outside_time_window_rejected()
    {
        await using var factory = new LiveGamesWebAppFactory();
        var (_, guestClient, _, guest, ev) = await SeedAsync(factory, scheduledAt: DateTime.UtcNow.AddHours(5));

        var response = await guestClient.PostAsJsonAsync($"/api/events/{ev.Id}/checkin", new
        {
            userId = guest.Id,
            latitude = ev.Latitude,
            longitude = ev.Longitude
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Host_confirm_pending_participant()
    {
        await using var factory = new LiveGamesWebAppFactory();
        var (hostClient, _, host, guest, ev) = await SeedAsync(factory);

        var response = await hostClient.PostAsJsonAsync(
            $"/api/events/{ev.Id}/attendance/{guest.Id}/confirm",
            new { confirmedByUserId = host.Id });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<ManualAttendanceResponse>(JsonOptions);
        Assert.Equal(LiveAttendanceStatus.Present, body!.AttendanceStatus);
        Assert.Equal(AttendanceVerificationMethod.HostManual, body.VerificationMethod);
        Assert.Equal(host.Id, body.VerifiedByUserId);
    }

    [Fact]
    public async Task Host_cannot_confirm_non_participant()
    {
        await using var factory = new LiveGamesWebAppFactory();
        var (hostClient, _, _, _, ev) = await SeedAsync(factory);
        var stranger = Guid.NewGuid();

        var response = await hostClient.PostAsJsonAsync(
            $"/api/events/{ev.Id}/attendance/{stranger}/confirm",
            new { confirmedByUserId = stranger });
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Present_participant_can_confirm_pending_peer()
    {
        await using var factory = new LiveGamesWebAppFactory();
        var (hostClient, guestClient, host, guest, ev) = await SeedAsync(factory);

        // Host auto check-in first.
        Assert.Equal(HttpStatusCode.OK, (await hostClient.PostAsJsonAsync($"/api/events/{ev.Id}/checkin", new
        {
            userId = host.Id,
            latitude = ev.Latitude,
            longitude = ev.Longitude
        })).StatusCode);

        // Host confirms guest → HostManual.
        var response = await hostClient.PostAsJsonAsync(
            $"/api/events/{ev.Id}/attendance/{guest.Id}/confirm",
            new { confirmedByUserId = host.Id });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        // Add third pending player.
        Guid thirdId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var third = BuildUser("Third", "third_" + Guid.NewGuid().ToString("N")[..6]);
            thirdId = third.Id;
            db.Users.Add(third);
            db.EventParticipants.Add(new EventParticipant
            {
                Id = Guid.NewGuid(),
                EventId = ev.Id,
                UserId = third.Id,
                JoinedAt = DateTime.UtcNow,
                Status = ParticipationStatus.Registered
            });
            await db.SaveChangesAsync();
        }

        // Guest is Present (HostManual). Guest confirms third → ParticipantManual.
        var peer = await guestClient.PostAsJsonAsync(
            $"/api/events/{ev.Id}/attendance/{thirdId}/confirm",
            new { confirmedByUserId = guest.Id });
        Assert.Equal(HttpStatusCode.OK, peer.StatusCode);
        var body = await peer.Content.ReadFromJsonAsync<ManualAttendanceResponse>(JsonOptions);
        Assert.Equal(AttendanceVerificationMethod.ParticipantManual, body!.VerificationMethod);
        Assert.Equal(guest.Id, body.VerifiedByUserId);
    }

    [Fact]
    public async Task Pending_participant_cannot_confirm_another()
    {
        await using var factory = new LiveGamesWebAppFactory();
        var (_, guestClient, host, _, ev) = await SeedAsync(factory);

        var response = await guestClient.PostAsJsonAsync(
            $"/api/events/{ev.Id}/attendance/{host.Id}/confirm",
            new { confirmedByUserId = host.Id });
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Self_confirm_blocked()
    {
        await using var factory = new LiveGamesWebAppFactory();
        var (_, guestClient, _, guest, ev) = await SeedAsync(factory);

        var response = await guestClient.PostAsJsonAsync(
            $"/api/events/{ev.Id}/attendance/{guest.Id}/confirm",
            new { confirmedByUserId = guest.Id });
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Unrelated_user_denied()
    {
        await using var factory = new LiveGamesWebAppFactory();
        var (_, _, _, guest, ev) = await SeedAsync(factory);

        // Create a user in DB but not in event participants.
        var stranger = BuildUser("Stranger", "str_" + Guid.NewGuid().ToString("N")[..6]);
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

        var response = await strangerClient.PostAsJsonAsync(
            $"/api/events/{ev.Id}/attendance/{guest.Id}/confirm",
            new { confirmedByUserId = stranger.Id });
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Already_present_confirm_is_idempotent()
    {
        await using var factory = new LiveGamesWebAppFactory();
        var (hostClient, _, host, guest, ev) = await SeedAsync(factory);

        await hostClient.PostAsJsonAsync($"/api/events/{ev.Id}/attendance/{guest.Id}/confirm",
            new { confirmedByUserId = host.Id });
        var second = await hostClient.PostAsJsonAsync($"/api/events/{ev.Id}/attendance/{guest.Id}/confirm",
            new { confirmedByUserId = host.Id });
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        var body = await second.Content.ReadFromJsonAsync<ManualAttendanceResponse>(JsonOptions);
        Assert.Equal(LiveAttendanceStatus.Present, body!.AttendanceStatus);
    }

    [Fact]
    public async Task Live_counts_and_can_confirm_flags()
    {
        await using var factory = new LiveGamesWebAppFactory();
        var (hostClient, _, host, guest, ev) = await SeedAsync(factory);

        await hostClient.PostAsJsonAsync($"/api/events/{ev.Id}/checkin", new
        {
            userId = host.Id,
            latitude = ev.Latitude,
            longitude = ev.Longitude
        });

        // GET live is [AllowAnonymous].
        var anonClient = factory.CreateClient();
        var live = await anonClient.GetFromJsonAsync<LiveEventResponse>(
            $"/api/events/{ev.Id}/live?userId={host.Id}", JsonOptions);
        Assert.Equal(2, live!.ParticipantCount);
        Assert.Equal(1, live.PresentCount);
        Assert.Equal(1, live.PendingCount);
        Assert.True(live.Permissions.CanConfirmAttendance);
        Assert.True(live.Permissions.CanManageAttendance);

        var guestRow = live.Participants.Single(p => p.UserId == guest.Id);
        Assert.True(guestRow.CanConfirmAttendance);
        Assert.Equal(LiveAttendanceStatus.Pending, guestRow.AttendanceStatus);

        var hostRow = live.Participants.Single(p => p.UserId == host.Id);
        Assert.False(hostRow.CanConfirmAttendance);
        Assert.DoesNotContain("latitude",
            await (await anonClient.GetAsync($"/api/events/{ev.Id}/live?userId={host.Id}")).Content.ReadAsStringAsync(),
            StringComparison.OrdinalIgnoreCase);
    }

    private static User BuildUser(string name, string username) => new()
    {
        Id = Guid.NewGuid(),
        Email = $"{username}@example.com",
        Username = username,
        DisplayName = name,
        FirstName = name.Split(' ')[0],
        LastName = "User",
        PasswordHash = new PasswordHasher<User>().HashPassword(null!, "CorrectHorseBattery1!"),
        PreferredSports = UserMapper.SerializePreferredSports(["tennis"]),
        SkillLevel = "Intermediate",
        Latitude = -33.8688,
        Longitude = 151.2093,
        IsActive = true,
        CreatedAt = DateTime.UtcNow
    };

    private static async Task<(HttpClient HostClient, HttpClient GuestClient, User Host, User Guest, Event Ev)> SeedAsync(
        LiveGamesWebAppFactory factory,
        DateTime? scheduledAt = null)
    {
        var host = BuildUser("Host Player", "host_" + Guid.NewGuid().ToString("N")[..8]);
        var guest = BuildUser("Guest Player", "guest_" + Guid.NewGuid().ToString("N")[..8]);
        var start = scheduledAt ?? DateTime.UtcNow.AddMinutes(-5);
        var ev = new Event
        {
            Id = Guid.NewGuid(),
            Title = "Attendance match",
            Description = "test",
            CreatorId = host.Id,
            Latitude = -33.8688,
            Longitude = 151.2093,
            ScheduledAt = start,
            MaxPlayers = 4,
            Sport = "tennis",
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
}
