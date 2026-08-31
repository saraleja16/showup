namespace ShowUpBackend.Models.Entities;

/// <summary>
/// Attendance labels exposed on live/event cards.
/// Mapped from <see cref="ParticipationStatus"/> for reliability compatibility.
/// </summary>
public static class LiveAttendanceStatus
{
    public const string Pending = "Pending";
    public const string Present = "Present";
    public const string Absent = "Absent";
    public const string Excused = "Excused";

    public static string FromParticipation(ParticipationStatus status) => status switch
    {
        ParticipationStatus.Attended => Present,
        ParticipationStatus.NoShow => Absent,
        ParticipationStatus.Excused => Excused,
        _ => Pending
    };

    public static ParticipationStatus ToParticipation(string liveStatus) =>
        liveStatus.Trim().ToLowerInvariant() switch
        {
            "present" => ParticipationStatus.Attended,
            "absent" => ParticipationStatus.NoShow,
            "excused" => ParticipationStatus.Excused,
            _ => ParticipationStatus.Registered
        };
}
