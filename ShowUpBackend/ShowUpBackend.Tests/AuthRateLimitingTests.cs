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

public class AuthRateLimitWebAppFactory : WebApplicationFactory<Program>
{
    public string DbName { get; } = "AuthRateLimitTests_" + Guid.NewGuid();

    public int LoginPermitLimit { get; init; } = 5;
    public int LoginWindowSeconds { get; init; } = 60;
    public int RegisterPermitLimit { get; init; } = 3;
    public int RegisterWindowSeconds { get; init; } = 600;
    public int AvailabilityPermitLimit { get; init; } = 30;
    public int AvailabilityWindowSeconds { get; init; } = 60;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        Environment.SetEnvironmentVariable("Jwt__Key", "TEST_JWT_SIGNING_KEY_32_CHARS_MIN_OK!!");

        builder.UseSetting("RateLimiting:LoginPermitLimit", LoginPermitLimit.ToString());
        builder.UseSetting("RateLimiting:LoginWindowSeconds", LoginWindowSeconds.ToString());
        builder.UseSetting("RateLimiting:RegisterPermitLimit", RegisterPermitLimit.ToString());
        builder.UseSetting("RateLimiting:RegisterWindowSeconds", RegisterWindowSeconds.ToString());
        builder.UseSetting("RateLimiting:AvailabilityPermitLimit", AvailabilityPermitLimit.ToString());
        builder.UseSetting("RateLimiting:AvailabilityWindowSeconds", AvailabilityWindowSeconds.ToString());
        builder.UseSetting("RateLimiting:TrustForwardedHeaders", "false");

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

public class AuthRateLimitingTests
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    [Fact]
    public async Task Login_allows_limit_then_returns_429_with_message()
    {
        await using var factory = new AuthRateLimitWebAppFactory
        {
            LoginPermitLimit = 5,
            LoginWindowSeconds = 60
        };
        var client = factory.CreateClient();
        await EnsureUserAsync(factory, "rate_login@example.com", "CorrectHorseBattery1!");

        for (var i = 0; i < 5; i++)
        {
            var response = await client.PostAsJsonAsync("/api/auth/login", new
            {
                email = "rate_login@example.com",
                password = "WrongPassword!!"
            });
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }

        var limited = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "rate_login@example.com",
            password = "WrongPassword!!"
        });

        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.NotNull(limited.Headers.RetryAfter);
        var body = await limited.Content.ReadFromJsonAsync<MessageBody>(JsonOptions);
        Assert.Equal("Too many attempts. Please try again shortly.", body?.Message);
    }

    [Fact]
    public async Task Login_succeeds_within_limit_and_returns_jwt()
    {
        await using var factory = new AuthRateLimitWebAppFactory
        {
            LoginPermitLimit = 5,
            LoginWindowSeconds = 60
        };
        var client = factory.CreateClient();
        await EnsureUserAsync(factory, "ok_login@example.com", "CorrectHorseBattery1!");

        var response = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "ok_login@example.com",
            password = "CorrectHorseBattery1!"
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var user = await response.Content.ReadFromJsonAsync<AuthUserResponse>(JsonOptions);
        Assert.False(string.IsNullOrWhiteSpace(user?.AccessToken));
    }

    [Fact]
    public async Task Login_becomes_usable_again_after_window()
    {
        await using var factory = new AuthRateLimitWebAppFactory
        {
            LoginPermitLimit = 2,
            LoginWindowSeconds = 2
        };
        var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "missing@example.com",
            password = "x"
        })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "missing@example.com",
            password = "x"
        })).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "missing@example.com",
            password = "x"
        })).StatusCode);

        await Task.Delay(TimeSpan.FromSeconds(2.2));

        var afterWindow = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "missing@example.com",
            password = "x"
        });
        Assert.Equal(HttpStatusCode.Unauthorized, afterWindow.StatusCode);
    }

    [Fact]
    public async Task Register_returns_429_after_limit()
    {
        await using var factory = new AuthRateLimitWebAppFactory
        {
            RegisterPermitLimit = 2,
            RegisterWindowSeconds = 600
        };
        var client = factory.CreateClient();

        for (var i = 0; i < 2; i++)
        {
            var response = await client.PostAsJsonAsync("/api/auth/register", BuildRegister($"reg{i}_{Guid.NewGuid():N}"[..16]));
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        }

        var limited = await client.PostAsJsonAsync(
            "/api/auth/register",
            BuildRegister($"regx_{Guid.NewGuid():N}"[..16]));
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        var body = await limited.Content.ReadFromJsonAsync<MessageBody>(JsonOptions);
        Assert.Equal("Too many attempts. Please try again shortly.", body?.Message);
    }

    [Fact]
    public async Task Check_username_returns_429_after_availability_limit()
    {
        await using var factory = new AuthRateLimitWebAppFactory
        {
            AvailabilityPermitLimit = 3,
            AvailabilityWindowSeconds = 60
        };
        var client = factory.CreateClient();

        for (var i = 0; i < 3; i++)
        {
            var response = await client.GetAsync($"/api/users/check-username/user{i}");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }

        var limited = await client.GetAsync("/api/users/check-username/overflow");
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
    }

    [Fact]
    public async Task Malformed_login_does_not_crash()
    {
        await using var factory = new AuthRateLimitWebAppFactory();
        var client = factory.CreateClient();
        var response = await client.PostAsync(
            "/api/auth/login",
            new StringContent("{", System.Text.Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    private static async Task EnsureUserAsync(AuthRateLimitWebAppFactory factory, string email, string password)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.EnsureCreatedAsync();

        var hasher = new PasswordHasher<User>();
        var user = new User
        {
            Id = Guid.NewGuid(),
            FirstName = "Rate",
            LastName = "Limit",
            DisplayName = "Rate Limit",
            Username = "u_" + Guid.NewGuid().ToString("N")[..10],
            Email = email,
            PasswordHash = hasher.HashPassword(null!, password),
            DateOfBirth = new DateOnly(1995, 1, 1),
            Sex = "unspecified",
            PreferredSports = UserMapper.SerializePreferredSports(["tennis"]),
            IsActive = true,
            IsPrivate = false,
            CreatedAt = DateTime.UtcNow
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
    }

    private static object BuildRegister(string username) => new
    {
        firstName = "Test",
        lastName = "User",
        username,
        email = $"{username}@example.com",
        password = "CorrectHorseBattery1!",
        dateOfBirth = "1995-01-01",
        sex = "Other",
        preferredSports = new[] { "Tennis" }
    };

    private sealed class MessageBody
    {
        public string? Message { get; set; }
    }
}
