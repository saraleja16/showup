using Microsoft.EntityFrameworkCore;
using System.Net.Http.Headers;
using ShowUpBackend.Data;
using ShowUpBackend.Helpers;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Models.Entities;
using ShowUpBackend.Services.Interfaces;
using ShowUpBackend.Sports;

namespace ShowUpBackend.Services;

public class ProfileService : IProfileService
{
    private const long MaxAvatarBytes = 5 * 1024 * 1024;
    private static readonly HashSet<string> AllowedAvatarContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "image/heic",
        "image/heif"
    };

    private readonly AppDbContext _context;
    private readonly IConfiguration _configuration;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IReliabilityService _reliabilityService;
    private readonly IProfilePortfolioService _portfolioService;

    public ProfileService(
        AppDbContext context,
        IConfiguration configuration,
        IHttpClientFactory httpClientFactory,
        IReliabilityService reliabilityService,
        IProfilePortfolioService portfolioService)
    {
        _context = context;
        _configuration = configuration;
        _httpClientFactory = httpClientFactory;
        _reliabilityService = reliabilityService;
        _portfolioService = portfolioService;
    }

    public async Task<ProfileDto?> GetProfileAsync(Guid userId)
    {
        var user = await _context.Users.FindAsync(userId);
        if (user is null) return null;

        // Stats + upcoming list share portfolio classification rules.
        var portfolio = await _portfolioService.GetPortfolioAsync(userId, playedLimit: 0, hostedLimit: 0, upcomingLimit: 20);
        var stats = portfolio?.Stats ?? await _portfolioService.GetStatsAsync(userId);

        var upcomingGames = (portfolio?.UpcomingGames ?? [])
            .Select(g => new UpcomingGameDto
            {
                EventId = g.EventId,
                Sport = g.Sport,
                Title = g.Title,
                VenueName = g.VenueName,
                ScheduledAt = g.ScheduledStart,
                ScheduledStart = g.ScheduledStart,
                ScheduledEnd = g.ScheduledEnd,
                ServerNow = g.ServerNow,
                Status = g.Status,
                ElapsedSeconds = g.ElapsedSeconds,
                RemainingSeconds = g.RemainingSeconds,
                SecondsUntilStart = g.SecondsUntilStart,
                CurrentPlayers = g.ParticipantCount,
                MaxPlayers = 0,
                IsHost = g.IsHost,
                ResultSummary = g.Result is null
                    ? null
                    : new EventResultSummaryDto
                    {
                        ResultId = g.Result.ResultId,
                        Status = g.Result.Status,
                        Sport = g.Result.Sport,
                        Summary = g.Result.Summary,
                        ScoreA = g.Result.ScoreA,
                        ScoreB = g.Result.ScoreB,
                        UnitsWonA = g.Result.SideAWins,
                        UnitsWonB = g.Result.SideBWins,
                        Sets = g.Result.Sets,
                        Games = g.Result.Games,
                        SideALabel = g.Result.SideALabel,
                        SideBLabel = g.Result.SideBLabel
                    },
                Permissions = g.Permissions
            })
            .ToList();

        // Preserve MaxPlayers on compact upcoming cards with one batched lookup.
        if (upcomingGames.Count > 0)
        {
            var ids = upcomingGames.Select(g => g.EventId).ToList();
            var maxMap = await _context.Events.AsNoTracking()
                .Where(e => ids.Contains(e.Id))
                .Select(e => new { e.Id, e.MaxPlayers })
                .ToDictionaryAsync(e => e.Id, e => e.MaxPlayers);
            foreach (var g in upcomingGames)
            {
                if (maxMap.TryGetValue(g.EventId, out var max))
                    g.MaxPlayers = max;
            }
        }

        var (score, tier, sampleSize) = await _reliabilityService.GetDetailsAsync(userId);

        return new ProfileDto
        {
            User = new ProfileUserDto
            {
                Id = user.Id,
                Name = user.DisplayName,
                FirstName = user.FirstName,
                LastName = user.LastName,
                Username = user.Username,
                Email = user.Email,
                AvatarUrl = user.AvatarUrl,
                SkillLevel = user.SkillLevel
            },
            Stats = stats,
            Reliability = new ProfileReliabilityDto
            {
                Score = score,
                Tier = tier,
                SampleSize = sampleSize
            },
            Sports = UserMapper.ParsePreferredSports(user.PreferredSports).Where(SportCatalog.IsEnabled).ToList(),
            UpcomingGames = upcomingGames
        };
    }

    public Task<ProfilePortfolioResponse?> GetPortfolioAsync(Guid userId) =>
        _portfolioService.GetPortfolioAsync(userId);

    public Task<(PortfolioGamesPageResponse? Page, string? Error, int StatusCode)> GetGamesAsync(
        Guid userId, string type, int page = 1, int pageSize = 20) =>
        _portfolioService.GetGamesAsync(userId, type, page, pageSize);

    public async Task<(ProfileDto? Profile, string? Error, int StatusCode)> UpdateProfileAsync(
        Guid userId, UpdateProfileRequest request)
    {
        var user = await _context.Users.FindAsync(userId);
        if (user is null) return (null, "User not found", StatusCodes.Status404NotFound);

        var firstName = request.FirstName.Trim();
        var lastName = request.LastName.Trim();
        var username = request.Username.Trim();

        if (string.IsNullOrWhiteSpace(firstName))
            return (null, "First name is required", StatusCodes.Status400BadRequest);

        if (string.IsNullOrWhiteSpace(lastName))
            return (null, "Last name is required", StatusCodes.Status400BadRequest);

        if (string.IsNullOrWhiteSpace(username))
            return (null, "Username is required", StatusCodes.Status400BadRequest);

        var usernameExists = await _context.Users
            .AnyAsync(u => u.Id != userId && u.Username == username);

        if (usernameExists)
            return (null, "Username is already taken", StatusCodes.Status409Conflict);

        user.FirstName = firstName;
        user.LastName = lastName;
        user.Username = username;
        user.DisplayName = $"{firstName} {lastName}".Trim();

        await _context.SaveChangesAsync();

        var profile = await GetProfileAsync(userId);
        return (profile, null, StatusCodes.Status200OK);
    }

    public async Task<(string? AvatarUrl, string? Error, int StatusCode)> UpdateAvatarAsync(
        Guid userId, IFormFile file)
    {
        var user = await _context.Users.FindAsync(userId);
        if (user is null) return (null, "User not found", StatusCodes.Status404NotFound);

        if (file is null || file.Length == 0)
            return (null, "Image file is required", StatusCodes.Status400BadRequest);

        if (file.Length > MaxAvatarBytes)
            return (null, "Image file must be 5 MB or smaller", StatusCodes.Status400BadRequest);

        if (!AllowedAvatarContentTypes.Contains(file.ContentType))
            return (null, "Only image uploads are supported", StatusCodes.Status400BadRequest);

        var supabaseUrl = _configuration["SupabaseStorage:Url"]?.TrimEnd('/');
        var serviceRoleKey = _configuration["SupabaseStorage:ServiceRoleKey"];
        var bucket = _configuration["SupabaseStorage:Bucket"] ?? "profile-photos";

        if (string.IsNullOrWhiteSpace(supabaseUrl) || string.IsNullOrWhiteSpace(serviceRoleKey))
            return (null, "Supabase Storage is not configured", StatusCodes.Status500InternalServerError);

        var objectPath = $"users/{userId}/{Guid.NewGuid():N}{GetExtension(file.ContentType)}";
        var uploadUrl = $"{supabaseUrl}/storage/v1/object/{bucket}/{objectPath}";

        using var stream = file.OpenReadStream();
        using var content = new StreamContent(stream);
        content.Headers.ContentType = MediaTypeHeaderValue.Parse(file.ContentType);

        var client = _httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, uploadUrl)
        {
            Content = content
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", serviceRoleKey);
        request.Headers.Add("apikey", serviceRoleKey);
        request.Headers.Add("x-upsert", "true");

        var response = await client.SendAsync(request);
        if (!response.IsSuccessStatusCode)
            return (null, "Could not upload profile photo", StatusCodes.Status502BadGateway);

        var avatarUrl = $"{supabaseUrl}/storage/v1/object/public/{bucket}/{objectPath}";
        user.AvatarUrl = avatarUrl;
        await _context.SaveChangesAsync();

        return (avatarUrl, null, StatusCodes.Status200OK);
    }

    public async Task<(bool Success, string? Error, int StatusCode)> DeleteAvatarAsync(Guid userId)
    {
        var user = await _context.Users.FindAsync(userId);
        if (user is null) return (false, "User not found", StatusCodes.Status404NotFound);

        if (string.IsNullOrWhiteSpace(user.AvatarUrl))
            return (true, null, StatusCodes.Status204NoContent);

        var supabaseUrl = _configuration["SupabaseStorage:Url"]?.TrimEnd('/');
        var serviceRoleKey = _configuration["SupabaseStorage:ServiceRoleKey"];
        var bucket = _configuration["SupabaseStorage:Bucket"] ?? "profile-photos";

        if (TryGetStorageObjectPath(user.AvatarUrl, supabaseUrl, bucket, out var objectPath))
        {
            if (string.IsNullOrWhiteSpace(supabaseUrl) || string.IsNullOrWhiteSpace(serviceRoleKey))
                return (false, "Supabase Storage is not configured", StatusCodes.Status500InternalServerError);

            var deleteUrl = $"{supabaseUrl}/storage/v1/object/{bucket}/{objectPath}";
            var client = _httpClientFactory.CreateClient();
            using var request = new HttpRequestMessage(HttpMethod.Delete, deleteUrl);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", serviceRoleKey);
            request.Headers.Add("apikey", serviceRoleKey);

            var response = await client.SendAsync(request);
            if (!response.IsSuccessStatusCode && response.StatusCode != System.Net.HttpStatusCode.NotFound)
                return (false, "Could not delete profile photo", StatusCodes.Status502BadGateway);
        }

        user.AvatarUrl = null;
        await _context.SaveChangesAsync();

        return (true, null, StatusCodes.Status204NoContent);
    }

    public async Task<(List<string>? Sports, string? Error, int StatusCode)> UpdateSportsAsync(
        Guid userId, UpdateSportsRequest request)
    {
        var user = await _context.Users.FindAsync(userId);
        if (user is null) return (null, "User not found", 404);

        // Trim, lowercase, drop empties, deduplicate preserving first-occurrence order.
        var cleaned = request.Sports
            .Select(s => s.Trim().ToLowerInvariant())
            .Where(s => !string.IsNullOrEmpty(s))
            .Distinct()
            .ToList();

        var unknownIds = cleaned.Where(s => !SportCatalog.IsEnabled(s)).ToList();
        if (unknownIds.Count > 0)
            return (null, $"Unknown sport ids: {string.Join(", ", unknownIds)}", 400);

        user.PreferredSports = UserMapper.SerializePreferredSports(cleaned);
        await _context.SaveChangesAsync();

        return (cleaned, null, 200);
    }

    private static string GetExtension(string contentType)
    {
        return contentType.ToLowerInvariant() switch
        {
            "image/jpeg" => ".jpg",
            "image/png" => ".png",
            "image/webp" => ".webp",
            "image/gif" => ".gif",
            "image/heic" => ".heic",
            "image/heif" => ".heif",
            _ => ".img"
        };
    }

    private static bool TryGetStorageObjectPath(
        string avatarUrl,
        string? supabaseUrl,
        string bucket,
        out string objectPath)
    {
        objectPath = string.Empty;
        if (string.IsNullOrWhiteSpace(supabaseUrl)) return false;

        var prefix = $"{supabaseUrl.TrimEnd('/')}/storage/v1/object/public/{bucket}/";
        if (!avatarUrl.StartsWith(prefix, StringComparison.Ordinal)) return false;

        objectPath = Uri.UnescapeDataString(avatarUrl[prefix.Length..]);
        return !string.IsNullOrWhiteSpace(objectPath);
    }
}
