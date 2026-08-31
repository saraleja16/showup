using ShowUpBackend.Models.DTOs;

namespace ShowUpBackend.Services.Interfaces;

public interface IChatService
{
    Task<(List<ConversationDto>? Conversations, string? Error, int StatusCode)> GetConversationsAsync(
        Guid currentUserId,
        CancellationToken cancellationToken = default);

    Task<(MessagesResponse? Response, string? Error, int StatusCode)> GetMessagesAsync(
        Guid currentUserId,
        Guid connectionId,
        int? pageSize,
        string? cursor,
        CancellationToken cancellationToken = default);

    Task<(MessageDto? Message, string? Error, int StatusCode)> SendMessageAsync(
        Guid currentUserId,
        Guid connectionId,
        SendMessageRequest request,
        CancellationToken cancellationToken = default);

    Task<(bool Success, string? Error, int StatusCode)> MarkReadAsync(
        Guid currentUserId,
        Guid connectionId,
        CancellationToken cancellationToken = default);
}
