namespace ShowUpBackend.Models.DTOs;

public class CheckInResponse
{
    public Guid EventId { get; set; }
    public Guid UserId { get; set; }
    public string Status { get; set; } = string.Empty;
    public string AttendanceStatus { get; set; } = string.Empty;
    public string? VerificationMethod { get; set; }
    public DateTime StatusUpdatedAt { get; set; }
    public double DistanceMeters { get; set; }
}
