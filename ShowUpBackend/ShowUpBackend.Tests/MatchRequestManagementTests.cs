using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using ShowUpBackend.Data;
using ShowUpBackend.Helpers;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Models.Entities;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Tests;

public class MatchRequestManagementTests
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    [Fact]
    public async Task Send_lists_duplicate_accept_reject_cancel_and_authz()
    {
        await using var factory = new MatchmakingWebAppFactory();
        Guid userBId = Guid.Empty;
        Guid userCId = Guid.Empty;

        var (clientA, userAId) = await SeedAndAuthAsync(factory, async (db, _) =>
        {
            var b = BuildUser("User B", "userb1", "tennis", "Intermediate", -33.865, 151.21);
            var c = BuildUser("User C", "userc1", "tennis", "Intermediate", -33.866, 151.21);
            userBId = b.Id;
            userCId = c.Id;
            db.Users.AddRange(b, c);
            await db.SaveChangesAsync();
        });

        string tokenB;
        string tokenC;
        using (var scope = factory.Services.CreateScope())
        {
            var tokens = scope.ServiceProvider.GetRequiredService<ITokenService>();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            tokenB = tokens.CreateAccessToken(await db.Users.FirstAsync(u => u.Id == userBId));
            tokenC = tokens.CreateAccessToken(await db.Users.FirstAsync(u => u.Id == userCId));
        }

        var clientB = factory.CreateClient();
        clientB.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", tokenB);
        var clientC = factory.CreateClient();
        clientC.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", tokenC);

        // A sends B a request (connect = pending).
        var connect = await (await clientA.PostAsync($"/api/matches/{userBId}/connect", null))
            .Content.ReadFromJsonAsync<MatchActionResponse>(JsonOptions);
        Assert.True(connect!.Success);
        Assert.False(connect.IsMutualMatch);
        Assert.NotNull(connect.RequestId);
        var requestId = connect.RequestId!.Value;

        // Duplicate send stays a single decision row.
        await clientA.PostAsync($"/api/matches/{userBId}/connect", null);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var count = await db.MatchDecisions.CountAsync(d =>
                d.FromUserId == userAId && d.ToUserId == userBId && d.Decision == MatchDecisionType.Connect);
            Assert.Equal(1, count);
        }

        var sent = await clientA.GetFromJsonAsync<MatchRequestListResponse>("/api/matches/requests/sent", JsonOptions);
        Assert.Contains(sent!.Items, i => i.RequestId == requestId && i.User.Id == userBId);
        Assert.Equal(MatchRequestStatus.Pending, sent.Items.First(i => i.RequestId == requestId).Status);

        var incomingB = await clientB.GetFromJsonAsync<MatchRequestListResponse>("/api/matches/requests/incoming", JsonOptions);
        Assert.Contains(incomingB!.Items, i => i.RequestId == requestId && i.User.Id == userAId);

        // A cannot accept own outgoing request.
        var ownAccept = await clientA.PostAsync($"/api/matches/requests/{requestId}/accept", null);
        Assert.Equal(HttpStatusCode.Forbidden, ownAccept.StatusCode);

        // Unrelated user C cannot accept/reject.
        Assert.Equal(HttpStatusCode.Forbidden,
            (await clientC.PostAsync($"/api/matches/requests/{requestId}/accept", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await clientC.PostAsync($"/api/matches/requests/{requestId}/reject", null)).StatusCode);

        // B accepts → Connection created, incoming clears.
        var accept = await (await clientB.PostAsync($"/api/matches/requests/{requestId}/accept", null))
            .Content.ReadFromJsonAsync<MatchRequestActionResponse>(JsonOptions);
        Assert.True(accept!.Success);
        Assert.Equal(MatchRequestStatus.Accepted, accept.Status);
        Assert.NotNull(accept.ConnectionId);

        var incomingAfter = await clientB.GetFromJsonAsync<MatchRequestListResponse>("/api/matches/requests/incoming", JsonOptions);
        Assert.DoesNotContain(incomingAfter!.Items, i => i.RequestId == requestId);

        var sentAfter = await clientA.GetFromJsonAsync<MatchRequestListResponse>("/api/matches/requests/sent", JsonOptions);
        Assert.DoesNotContain(sentAfter!.Items, i => i.RequestId == requestId);

        var connections = await clientA.GetFromJsonAsync<List<ConnectionDto>>("/api/matches/connections", JsonOptions);
        Assert.Contains(connections!, c => c.ConnectionId == accept.ConnectionId && c.UserId == userBId);
    }

    [Fact]
    public async Task Reject_appears_in_rejected_list_and_can_reopen()
    {
        await using var factory = new MatchmakingWebAppFactory();
        Guid userBId = Guid.Empty;

        var (clientA, userAId) = await SeedAndAuthAsync(factory, async (db, _) =>
        {
            var b = BuildUser("Rejector", "rejector1", "tennis", "Intermediate", -33.865, 151.21);
            userBId = b.Id;
            db.Users.Add(b);
            await db.SaveChangesAsync();
        });

        string tokenB;
        using (var scope = factory.Services.CreateScope())
        {
            var tokens = scope.ServiceProvider.GetRequiredService<ITokenService>();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            tokenB = tokens.CreateAccessToken(await db.Users.FirstAsync(u => u.Id == userBId));
        }

        var clientB = factory.CreateClient();
        clientB.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", tokenB);

        var connect = await (await clientA.PostAsync($"/api/matches/{userBId}/connect", null))
            .Content.ReadFromJsonAsync<MatchActionResponse>(JsonOptions);
        var requestId = connect!.RequestId!.Value;

        var reject = await (await clientB.PostAsync($"/api/matches/requests/{requestId}/reject", null))
            .Content.ReadFromJsonAsync<MatchRequestActionResponse>(JsonOptions);
        Assert.Equal(MatchRequestStatus.Rejected, reject!.Status);

        var rejected = await clientB.GetFromJsonAsync<MatchRequestListResponse>("/api/matches/requests/rejected", JsonOptions);
        Assert.Contains(rejected!.Items, i => i.RequestId == requestId && i.User.Id == userAId);

        var incoming = await clientB.GetFromJsonAsync<MatchRequestListResponse>("/api/matches/requests/incoming", JsonOptions);
        Assert.DoesNotContain(incoming!.Items, i => i.RequestId == requestId);

        var sent = await clientA.GetFromJsonAsync<MatchRequestListResponse>("/api/matches/requests/sent", JsonOptions);
        Assert.DoesNotContain(sent!.Items, i => i.RequestId == requestId);

        var reopen = await (await clientB.PostAsync($"/api/matches/requests/{requestId}/reopen", null))
            .Content.ReadFromJsonAsync<MatchRequestActionResponse>(JsonOptions);
        Assert.Equal(MatchRequestStatus.Pending, reopen!.Status);

        var incomingAgain = await clientB.GetFromJsonAsync<MatchRequestListResponse>("/api/matches/requests/incoming", JsonOptions);
        Assert.Contains(incomingAgain!.Items, i => i.RequestId == requestId);

        var counts = await clientB.GetFromJsonAsync<MatchRequestCountsDto>("/api/matches/requests/counts", JsonOptions);
        Assert.True(counts!.IncomingCount >= 1);
    }

    [Fact]
    public async Task Sender_can_cancel_pending_request()
    {
        await using var factory = new MatchmakingWebAppFactory();
        Guid userBId = Guid.Empty;

        var (clientA, _) = await SeedAndAuthAsync(factory, async (db, _) =>
        {
            var b = BuildUser("Cancel Target", "canceltgt", "tennis", "Intermediate", -33.865, 151.21);
            userBId = b.Id;
            db.Users.Add(b);
            await db.SaveChangesAsync();
        });

        string tokenB;
        using (var scope = factory.Services.CreateScope())
        {
            var tokens = scope.ServiceProvider.GetRequiredService<ITokenService>();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            tokenB = tokens.CreateAccessToken(await db.Users.FirstAsync(u => u.Id == userBId));
        }

        var clientB = factory.CreateClient();
        clientB.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", tokenB);

        var connect = await (await clientA.PostAsync($"/api/matches/{userBId}/connect", null))
            .Content.ReadFromJsonAsync<MatchActionResponse>(JsonOptions);
        var requestId = connect!.RequestId!.Value;

        // Recipient cannot cancel.
        Assert.Equal(HttpStatusCode.Forbidden,
            (await clientB.DeleteAsync($"/api/matches/requests/{requestId}")).StatusCode);

        var cancel = await (await clientA.DeleteAsync($"/api/matches/requests/{requestId}"))
            .Content.ReadFromJsonAsync<MatchRequestActionResponse>(JsonOptions);
        Assert.Equal(MatchRequestStatus.Cancelled, cancel!.Status);

        var sent = await clientA.GetFromJsonAsync<MatchRequestListResponse>("/api/matches/requests/sent", JsonOptions);
        Assert.DoesNotContain(sent!.Items, i => i.RequestId == requestId);

        var incoming = await clientB.GetFromJsonAsync<MatchRequestListResponse>("/api/matches/requests/incoming", JsonOptions);
        Assert.DoesNotContain(incoming!.Items, i => i.RequestId == requestId);
    }

    [Fact]
    public async Task Blocked_users_cannot_send_or_accept()
    {
        await using var factory = new MatchmakingWebAppFactory();
        Guid userBId = Guid.Empty;

        var (clientA, userAId) = await SeedAndAuthAsync(factory, async (db, viewerId) =>
        {
            var b = BuildUser("Blocked Peer", "blockedpeer", "tennis", "Intermediate", -33.865, 151.21);
            userBId = b.Id;
            db.Users.Add(b);
            db.UserBlocks.Add(new UserBlock
            {
                Id = Guid.NewGuid(),
                BlockerUserId = viewerId,
                BlockedUserId = b.Id,
                CreatedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        });

        var blockedConnect = await clientA.PostAsync($"/api/matches/{userBId}/connect", null);
        Assert.Equal(HttpStatusCode.NotFound, blockedConnect.StatusCode);

        // Seed a request from B→A then block, accept must fail for A if B blocked A... 
        // Clear block and create request from B, then B blocks A — A cannot accept.
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.UserBlocks.RemoveRange(db.UserBlocks);
            db.MatchDecisions.Add(new MatchDecision
            {
                Id = Guid.NewGuid(),
                FromUserId = userBId,
                ToUserId = userAId,
                Decision = MatchDecisionType.Connect,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            });
            db.UserBlocks.Add(new UserBlock
            {
                Id = Guid.NewGuid(),
                BlockerUserId = userBId,
                BlockedUserId = userAId,
                CreatedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        }

        Guid requestId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            requestId = await db.MatchDecisions
                .Where(d => d.FromUserId == userBId && d.ToUserId == userAId)
                .Select(d => d.Id)
                .FirstAsync();
        }

        var accept = await clientA.PostAsync($"/api/matches/requests/{requestId}/accept", null);
        Assert.Equal(HttpStatusCode.NotFound, accept.StatusCode);
    }

    private static async Task<(HttpClient Client, Guid UserId)> SeedAndAuthAsync(
        MatchmakingWebAppFactory factory,
        Func<AppDbContext, Guid, Task>? seedExtra = null)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var me = BuildUser("Viewer", "viewer_" + Guid.NewGuid().ToString("N")[..6], "tennis", "Intermediate", -33.8688, 151.2093);
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
        double lng) => new()
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
