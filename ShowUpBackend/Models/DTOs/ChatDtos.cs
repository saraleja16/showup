using System.Text.Json.Serialization;

namespace ShowUpBackend.Models.DTOs;

public class MessageDto
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }

    [JsonPropertyName("connectionId")]
    public Guid ConnectionId { get; set; }

    [JsonPropertyName("senderId")]
    public Guid SenderId { get; set; }

    [JsonPropertyName("content")]
    public string Content { get; set; } = string.Empty;

    [JsonPropertyName("createdAt")]
    public DateTime CreatedAt { get; set; }

    [JsonPropertyName("readAt")]
    public DateTime? ReadAt { get; set; }
}

public class MessagesResponse
{
    [JsonPropertyName("items")]
    public List<MessageDto> Items { get; set; } = [];

    [JsonPropertyName("nextCursor")]
    public string? NextCursor { get; set; }
}

public class SendMessageRequest
{
    [JsonPropertyName("content")]
    public string Content { get; set; } = string.Empty;
}

public class ConversationDto
{
    [JsonPropertyName("connectionId")]
    public Guid ConnectionId { get; set; }

    [JsonPropertyName("otherUserId")]
    public Guid OtherUserId { get; set; }

    [JsonPropertyName("otherUserDisplayName")]
    public string OtherUserDisplayName { get; set; } = string.Empty;

    [JsonPropertyName("otherUserAvatarUrl")]
    public string? OtherUserAvatarUrl { get; set; }

    [JsonPropertyName("lastMessage")]
    public string? LastMessage { get; set; }

    [JsonPropertyName("lastMessageAt")]
    public DateTime? LastMessageAt { get; set; }

    [JsonPropertyName("unreadCount")]
    public int UnreadCount { get; set; }

    [JsonPropertyName("connectedAt")]
    public DateTime ConnectedAt { get; set; }
}
