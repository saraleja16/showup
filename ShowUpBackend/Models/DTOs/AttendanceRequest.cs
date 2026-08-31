namespace ShowUpBackend.Models.DTOs;

public class AttendanceRequest
{
    public Guid HostUserId { get; set; }
    public List<Guid> NoShowUserIds { get; set; } = [];
}
