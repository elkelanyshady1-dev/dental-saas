import { useAuth } from "../context/AuthContext";

export default function useFeature(featureKey) {
    const { user } = useAuth();

    if (!user || (!user.organization && user.platformRole !== "superadmin")) return false;

    // If user is a superadmin looking at platform (not mapped to org), or just default true for superadmins.
    if (user.platformRole === "superadmin" || user.platformRole === "platform_admin") {
        return true; // Super admins have access to all modules effectively.
    }

    return user.organization?.features?.[featureKey]?.enabled || false;
}
