using System.Text;
using Microsoft.EntityFrameworkCore;
using ShowUpBackend.Data;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Models.Entities;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Services;

public class ChatService : IChatService
{
    private const int DefaultPageSize = 30;
    private const int MaxPageSize = 100;
    private const int MaxContentLength = 2000;

    private readonly AppDbContext _context;
    private readonly INotificationService _notificationService;

    public ChatService(AppDbContext context, INotificationService notificationService)
    {
        _context = context;
        _notificationService = notificationService;
    }

    public async Task<(List<ConversationDto>? Conversations, string? Error, int StatusCode)> GetConversationsAsync(
        Guid currentUserId,
        CancellationToken cancellationToken = default)
    {
        var connections = await _context.Connections.AsNoTracking()
            .Where(c => c.UserAId == currentUserId || c.UserBId == currentUserId)
            .Select(c => new
            {
                c.Id,
                c.CreatedAt,
                OtherUserId = c.UserAId == currentUserId ? c.UserBId : c.UserAId
            })
            .ToListAsync(cancellationToken);

        if (connections.Count == 0)
            return ([], null, StatusCodes.Status200OK);

        var connectionIds = connections.Select(c => c.Id).ToList();
        var otherUserIds = connections.Select(c => c.OtherUserId).ToList();

        var otherUsers = await _context.Users.AsNoTracking()
            .Where(u => otherUserIds.Contains(u.Id))
            .Select(u => new { u.Id, u.DisplayName, u.AvatarUrl })
            .ToDictionaryAsync(u => u.Id, cancellationToken);

        // Last message per connection. Fetched newest-first and grouped client-side —
        // "first per group" doesn't translate reliably to SQL across providers, and the
        // per-user connection count here is small enough that this is cheap either way.
        var recentMessages = await _context.Messages.AsNoTracking()
            .Where(m => connectionIds.Contains(m.ConnectionId))
            .OrderByDescending(m => m.CreatedAt)
            .ToListAsync(cancellationToken);
        var lastMessageByConnection = recentMessages
            .GroupBy(m => m.ConnectionId)
            .ToDictionary(g => g.Key, g => g.First());

        // Unread counts (messages sent by the other person, not yet read).
        var unreadCounts = await _context.Messages.AsNoTracking()
            .Where(m => connectionIds.Contains(m.ConnectionId) && m.SenderId != currentUserId && m.ReadAt == null)
            .GroupBy(m => m.ConnectionId)
            .Select(g => new { ConnectionId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.ConnectionId, x => x.Count, cancellationToken);

        var result = connections.Select(c =>
        {
            var other = otherUsers.GetValueOrDefault(c.OtherUserId);
            var last = lastMessageByConnection.GetValueOrDefault(c.Id);
            return new ConversationDto
            {
                ConnectionId = c.Id,
                OtherUserId = c.OtherUserId,
                OtherUserDisplayName = other?.DisplayName ?? "Unknown player",
                OtherUserAvatarUrl = other?.AvatarUrl,
                LastMessage = last?.Content,
                LastMessageAt = last?.CreatedAt,
                UnreadCount = unreadCounts.GetValueOrDefault(c.Id),
                ConnectedAt = c.CreatedAt
            };
        })
        .OrderByDescending(c => c.LastMessageAt ?? c.ConnectedAt)
        .ToList();

        return (result, null, StatusCodes.Status200OK);
    }

    public async Task<(MessagesResponse? Response, string? Error, int StatusCode)> GetMessagesAsync(
        Guid currentUserId,
        Guid connectionId,
        int? pageSize,
        string? cursor,
        CancellationToken cancellationToken = default)
    {
        var connection = await GetAuthorizedConnectionAsync(currentUserId, connectionId, cancellationToken);
        if (connection is null)
            return (null, "Conversation not found", StatusCodes.Status404NotFound);

        var size = Math.Clamp(pageSize ?? DefaultPageSize, 1, MaxPageSize);

        var query = _context.Messages.AsNoTracking()
            .Where(m => m.ConnectionId == connectionId);

        if (ParseCursor(cursor, out var cursorCreatedAt, out var cursorId))
        {
            query = query.Where(m =>
                m.CreatedAt < cursorCreatedAt ||
                (m.CreatedAt == cursorCreatedAt && m.Id.CompareTo(cursorId) < 0));
        }

        // Fetch newest-first (page walking backward through history), then reverse to
        // chronological order for the response.
        var page = await query
            .OrderByDescending(m => m.CreatedAt)
            .ThenByDescending(m => m.Id)
            .Take(size)
            .ToListAsync(cancellationToken);

        string? nextCursor = null;
        if (page.Count == size)
        {
            var oldest = page[^1];
            nextCursor = EncodeCursor(oldest.CreatedAt, oldest.Id);
        }

        page.Reverse();

        return (new MessagesResponse
        {
            Items = page.Select(MapToDto).ToList(),
            NextCursor = nextCursor
        }, null, StatusCodes.Status200OK);
    }

    public async Task<(MessageDto? Message, string? Error, int StatusCode)> SendMessageAsync(
        Guid currentUserId,
        Guid connectionId,
        SendMessageRequest request,
        CancellationToken cancellationToken = default)
    {
        var content = request.Content?.Trim() ?? string.Empty;
        if (content.Length == 0)
            return (null, "Message cannot be empty", StatusCodes.Status400BadRequest);
        if (content.Length > MaxContentLength)
            return (null, $"Message cannot exceed {MaxContentLength} characters", StatusCodes.Status400BadRequest);

        var connection = await GetAuthorizedConnectionAsync(currentUserId, connectionId, cancellationToken);
        if (connection is null)
            return (null, "Conversation not found", StatusCodes.Status404NotFound);

        var otherUserId = connection.UserAId == currentUserId ? connection.UserBId : connection.UserAId;

        var isBlocked = await _context.UserBlocks.AsNoTracking().AnyAsync(b =>
            (b.BlockerUserId == currentUserId && b.BlockedUserId == otherUserId) ||
            (b.BlockerUserId == otherUserId && b.BlockedUserId == currentUserId), cancellationToken);
        if (isBlocked)
            return (null, "You can no longer message this user", StatusCodes.Status403Forbidden);

        var message = new Message
        {
            Id = Guid.NewGuid(),
            ConnectionId = connectionId,
            SenderId = currentUserId,
            Content = content,
            CreatedAt = DateTime.UtcNow
        };

        _context.Messages.Add(message);
        await _context.SaveChangesAsync(cancellationToken);

        var sender = await _context.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == currentUserId, cancellationToken);

        await _notificationService.SendPushNotificationToUserAsync(
            otherUserId,
            sender?.DisplayName ?? "New message",
            content.Length > 120 ? content[..120] + "…" : content,
            "message",
            data: new { connectionId });

        return (MapToDto(message), null, StatusCodes.Status201Created);
    }

    public async Task<(bool Success, string? Error, int StatusCode)> MarkReadAsync(
        Guid currentUserId,
        Guid connectionId,
        CancellationToken cancellationToken = default)
    {
        var connection = await GetAuthorizedConnectionAsync(currentUserId, connectionId, cancellationToken);
        if (connection is null)
            return (false, "Conversation not found", StatusCodes.Status404NotFound);

        await _context.Messages
            .Where(m => m.ConnectionId == connectionId && m.SenderId != currentUserId && m.ReadAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.ReadAt, DateTime.UtcNow), cancellationToken);

        return (true, null, StatusCodes.Status200OK);
    }

    private async Task<Connection?> GetAuthorizedConnectionAsync(
        Guid currentUserId, Guid connectionId, CancellationToken cancellationToken)
    {
        var connection = await _context.Connections.AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == connectionId, cancellationToken);

        if (connection is null) return null;
        if (connection.UserAId != currentUserId && connection.UserBId != currentUserId) return null;

        return connection;
    }

    private static MessageDto MapToDto(Message m) => new()
    {
        Id = m.Id,
        ConnectionId = m.ConnectionId,
        SenderId = m.SenderId,
        Content = m.Content,
        CreatedAt = m.CreatedAt,
        ReadAt = m.ReadAt
    };

    private static string EncodeCursor(DateTime createdAt, Guid id)
    {
        var raw = $"{createdAt:O}|{id:D}";
        return Convert.ToBase64String(Encoding.UTF8.GetBytes(raw));
    }

    private static bool ParseCursor(string? cursor, out DateTime createdAt, out Guid id)
    {
        createdAt = default;
        id = default;
        if (string.IsNullOrWhiteSpace(cursor)) return false;

        try
        {
            var raw = Encoding.UTF8.GetString(Convert.FromBase64String(cursor));
            var parts = raw.Split('|', 2);
            if (parts.Length != 2) return false;
            if (DateTime.TryParse(parts[0], null,
                    System.Globalization.DateTimeStyles.RoundtripKind, out var dt) &&
                Guid.TryParse(parts[1], out var gid))
            {
                createdAt = dt;
                id = gid;
                return true;
            }
        }
        catch
        {
            // Invalid cursor ignored — starts from the most recent page.
        }
        return false;
    }
}
