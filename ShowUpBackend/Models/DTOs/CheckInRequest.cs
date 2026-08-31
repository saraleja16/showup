namespace ShowUpBackend.Models.DTOs;

public class CheckInRequest
{
    public Guid UserId { get; set; }
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public double? AccuracyMeters { get; set; }
}
