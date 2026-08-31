using System.Text.Json.Serialization;

namespace ShowUpBackend.Models.DTOs;

public class ProfileUserDto
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("firstName")]
    public string FirstName { get; set; } = string.Empty;

    [JsonPropertyName("lastName")]
    public string LastName { get; set; } = string.Empty;

    [JsonPropertyName("username")]
    public string Username { get; set; } = string.Empty;

    [JsonPropertyName("email")]
    public string Email { get; set; } = string.Empty;

    [JsonPropertyName("avatarUrl")]
    public string? AvatarUrl { get; set; }

    [JsonPropertyName("skillLevel")]
    public string? SkillLevel { get; set; }
}

public class ProfileStatsDto
{
    [JsonPropertyName("gamesPlayed")]
    public int GamesPlayed { get; set; }

    [JsonPropertyName("gamesHosted")]
    public int GamesHosted { get; set; }

    [JsonPropertyName("upcomingCount")]
    public int UpcomingCount { get; set; }
}

public class ProfileReliabilityDto
{
    [JsonPropertyName("score")]
    public int Score { get; set; }

    [JsonPropertyName("tier")]
    public string Tier { get; set; } = string.Empty;

    [JsonPropertyName("sampleSize")]
    public int SampleSize { get; set; }
}

public class UpcomingGameDto
{
    [JsonPropertyName("eventId")]
    public Guid EventId { get; set; }

    [JsonPropertyName("sport")]
    public string Sport { get; set; } = string.Empty;

    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("venueName")]
    public string? VenueName { get; set; }

    [JsonPropertyName("scheduledAt")]
    public DateTime ScheduledAt { get; set; }

    [JsonPropertyName("scheduledStart")]
    public DateTime ScheduledStart { get; set; }

    [JsonPropertyName("scheduledEnd")]
    public DateTime? ScheduledEnd { get; set; }

    [JsonPropertyName("serverNow")]
    public DateTime? ServerNow { get; set; }

    [JsonPropertyName("status")]
    public string? Status { get; set; }

    [JsonPropertyName("elapsedSeconds")]
    public int? ElapsedSeconds { get; set; }

    [JsonPropertyName("remainingSeconds")]
    public int? RemainingSeconds { get; set; }

    [JsonPropertyName("secondsUntilStart")]
    public int? SecondsUntilStart { get; set; }

    [JsonPropertyName("currentPlayers")]
    public int CurrentPlayers { get; set; }

    [JsonPropertyName("maxPlayers")]
    public int MaxPlayers { get; set; }

    [JsonPropertyName("isHost")]
    public bool IsHost { get; set; }

    [JsonPropertyName("resultSummary")]
    public EventResultSummaryDto? ResultSummary { get; set; }

    [JsonPropertyName("permissions")]
    public EventPermissionsDto? Permissions { get; set; }
}

public class ProfileDto
{
    [JsonPropertyName("user")]
    public ProfileUserDto User { get; set; } = null!;

    [JsonPropertyName("stats")]
    public ProfileStatsDto Stats { get; set; } = null!;

    [JsonPropertyName("reliability")]
    public ProfileReliabilityDto Reliability { get; set; } = null!;

    [JsonPropertyName("sports")]
    public List<string> Sports { get; set; } = [];

    [JsonPropertyName("upcomingGames")]
    public List<UpcomingGameDto> UpcomingGames { get; set; } = [];
}
