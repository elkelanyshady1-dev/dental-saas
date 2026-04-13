import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

export default function AppLayout() {
    return (
        <div className="flex min-h-screen bg-slate-950">
            <Sidebar />
            <div className="flex-1 flex flex-col">
                <TopBar />
                <main className="flex-1 overflow-auto w-full">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
