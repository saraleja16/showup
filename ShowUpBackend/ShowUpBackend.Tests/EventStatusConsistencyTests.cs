using System.Net;
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

public class EventStatusConsistencyWebAppFactory : WebApplicationFactory<Program>
{
    public string DbName { get; } = "StatusConsistency_" + Guid.NewGuid();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        Environment.SetEnvironmentVariable("Jwt__Key", "TEST_JWT_SIGNING_KEY_32_CHARS_MIN_OK!!");
        builder.UseSetting("EventLifecycle:StartingSoonMinutes", "15");

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

public class EventStatusConsistencyTests
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

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

    [Fact]
    public async Task Same_live_status_across_detail_live_portfolio_and_list()
    {
        await using var factory = new EventStatusConsistencyWebAppFactory();
        var host = BuildUser("Host Player", "host_" + Guid.NewGuid().ToString("N")[..8]);
        var guest = BuildUser("Guest Player", "guest_" + Guid.NewGuid().ToString("N")[..8]);
        var start = DateTime.UtcNow.AddMinutes(-10);
        var ev = new Event
        {
            Id = Guid.NewGuid(),
            Title = "Consistency match",
            Description = "test",
            CreatorId = host.Id,
            Latitude = -33.8688,
            Longitude = 151.2093,
            ScheduledAt = start,
            MaxPlayers = 2,
            Sport = "tennis",
            SportDetails = """{"sessionType":"match","durationMinutes":60}""",
            CreatedAt = DateTime.UtcNow
        };

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Users.AddRange(host, guest);
            db.Events.Add(ev);
            db.EventParticipants.AddRange(
                new EventParticipant
                {
                    Id = Guid.NewGuid(),
                    EventId = ev.Id,
                    UserId = host.Id,
                    Status = ParticipationStatus.Registered,
                    JoinedAt = DateTime.UtcNow
                },
                new EventParticipant
                {
                    Id = Guid.NewGuid(),
                    EventId = ev.Id,
                    UserId = guest.Id,
                    Status = ParticipationStatus.Registered,
                    JoinedAt = DateTime.UtcNow
                });
            await db.SaveChangesAsync();
        }

        var client = factory.CreateClient();

        var detail = await client.GetFromJsonAsync<EventDto>($"/api/events/{ev.Id}?userId={host.Id}", JsonOptions);
        var live = await client.GetFromJsonAsync<LiveEventResponse>($"/api/events/{ev.Id}/live?userId={host.Id}", JsonOptions);
        var list = await client.GetFromJsonAsync<List<EventDto>>($"/api/events?userId={host.Id}", JsonOptions);
        var portfolio = await client.GetFromJsonAsync<ProfilePortfolioResponse>(
            $"/api/profile/{host.Id}/portfolio", JsonOptions);

        Assert.NotNull(detail);
        Assert.NotNull(live);
        Assert.NotNull(list);
        Assert.NotNull(portfolio);

        Assert.Equal(EventLifecycleStatus.Live, detail!.LiveStatus);
        Assert.Equal(EventLifecycleStatus.Live, detail.Status);
        Assert.Equal(EventLifecycleStatus.Live, live!.Status);

        var listItem = list!.First(e => e.Id == ev.Id);
        Assert.Equal(EventLifecycleStatus.Live, listItem.LiveStatus);
        Assert.Equal(EventLifecycleStatus.Live, listItem.Status);

        var card = portfolio!.UpcomingGames.First(g => g.EventId == ev.Id);
        Assert.Equal(EventLifecycleStatus.Live, card.EventStatus);
        Assert.Equal(EventLifecycleStatus.Live, card.Status);

        Assert.Equal(detail.LiveStatus, live.Status);
        Assert.Equal(detail.LiveStatus, listItem.LiveStatus);
        Assert.Equal(detail.LiveStatus, card.EventStatus);

        Assert.NotNull(detail.ScheduledEnd);
        Assert.NotNull(detail.ServerNow);
        Assert.NotNull(detail.Permissions);
        Assert.True(detail.Permissions!.CanManageAttendance);
        Assert.True(detail.Permissions.CanSubmitResult);
        Assert.True(live.Permissions.CanManageAttendance);
        Assert.True(card.Permissions.CanManageAttendance);

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/events/{ev.Id}/live")).StatusCode);
    }

    [Fact]
    public async Task Unrelated_viewer_gets_read_only_permissions_on_detail()
    {
        await using var factory = new EventStatusConsistencyWebAppFactory();
        var host = BuildUser("Host Player", "host_" + Guid.NewGuid().ToString("N")[..8]);
        var stranger = BuildUser("Stranger", "str_" + Guid.NewGuid().ToString("N")[..8]);
        var ev = new Event
        {
            Id = Guid.NewGuid(),
            Title = "Public match",
            Description = "test",
            CreatorId = host.Id,
            Latitude = -33.8688,
            Longitude = 151.2093,
            ScheduledAt = DateTime.UtcNow.AddMinutes(-5),
            MaxPlayers = 4,
            Sport = "soccer",
            SportDetails = """{"durationMinutes":90}""",
            CreatedAt = DateTime.UtcNow,
            IsPrivate = false
        };

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Users.AddRange(host, stranger);
            db.Events.Add(ev);
            db.EventParticipants.Add(new EventParticipant
            {
                Id = Guid.NewGuid(),
                EventId = ev.Id,
                UserId = host.Id,
                Status = ParticipationStatus.Registered,
                JoinedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        }

        var client = factory.CreateClient();
        var detail = await client.GetFromJsonAsync<EventDto>($"/api/events/{ev.Id}?userId={stranger.Id}", JsonOptions);
        Assert.NotNull(detail);
        Assert.Equal(EventLifecycleStatus.Live, detail!.Status);
        Assert.False(detail.Permissions!.CanSubmitResult);
        Assert.False(detail.Permissions.CanConfirmResult);
        Assert.False(detail.Permissions.CanDisputeResult);
        Assert.False(detail.Permissions.CanManageAttendance);
    }
}
