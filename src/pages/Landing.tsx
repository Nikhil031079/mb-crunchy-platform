import { useEffect } from "react";
import { useNavigate } from "react-router";
import { ROUTES } from "@/constants";

export default function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate(ROUTES.HOME, { replace: true });
  }, [navigate]);

  return null;
}
