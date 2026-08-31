namespace ShowUpBackend.Configuration;

/// <summary>
/// Attendance / check-in windows and radius.
/// Bound from "Attendance" with fallback from legacy "CheckIn" keys.
/// </summary>
public class AttendanceOptions
{
    public const string SectionName = "Attendance";

    /// <summary>Max distance from event venue for AutomaticLocation check-in.</summary>
    public double CheckInRadiusMeters { get; set; } = 200;

    /// <summary>Minutes before ScheduledAt when auto/manual windows open.</summary>
    public int MinutesBeforeStart { get; set; } = 10;

    /// <summary>Minutes after ScheduledAt when auto GPS check-in closes.</summary>
    public int MinutesAfterStart { get; set; } = 15;

    /// <summary>Minutes after scheduled end when manual confirmation remains allowed.</summary>
    public int MinutesAfterEnd { get; set; } = 60;
}
