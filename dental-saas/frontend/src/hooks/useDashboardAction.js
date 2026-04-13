import { useNavigate } from "react-router-dom";
import api from "@/services/api";
import { useBranch } from "@/context/BranchContext";

/**
 * Hook to handle dashboard shortcut actions
 */
export function useDashboardAction() {
    const navigate = useNavigate();
    const { selectedBranches } = useBranch();
    const branchId = selectedBranches?.[0]; // Primary branch context

    const executeAction = async (actionKey, payload = {}) => {
        try {
            const response = await api.post("/org/dashboard/action", {
                action: actionKey,
                payload,
                branchId
            });

            const { data } = response;

            // Handle standard navigation responses
            if (data?.target) {
                navigate(data.target);
                return;
            }

            // Specific action handling
            switch (actionKey) {
                case "add_patient":
                    navigate("/org/patients/new");
                    break;
                case "add_appointment":
                    // Open booking modal/page
                    navigate("/org/calendar?action=new_appointment");
                    break;
                case "add_expense":
                case "add_income":
                    navigate("/org/accounting");
                    break;
                default:
                    console.log(`Action ${actionKey} executed successfully`);
            }

            return response;

        } catch (error) {
            console.error(`Dashboard action execution failed [${actionKey}]:`, error);
            // In a better system, we'd trigger a toast notification here
            throw error;
        }
    };

    return { executeAction };
}
