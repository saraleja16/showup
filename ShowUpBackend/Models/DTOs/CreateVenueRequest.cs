namespace ShowUpBackend.Models.DTOs;

public class CreateVenueRequest
{
    public string Name { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public string Sports { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
}
