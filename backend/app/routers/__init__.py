from app.routers.assistant import router as assistant_router
from app.routers.auth import router as auth_router
from app.routers.billing import router as billing_router
from app.routers.clients import router as clients_router
from app.routers.compliance import router as compliance_router
from app.routers.communications import router as communications_router
from app.routers.documents import router as documents_router
from app.routers.financial_years import router as financial_years_router
from app.routers.messaging import router as messaging_router
from app.routers.notifications import router as notifications_router
from app.routers.reports import router as reports_router
from app.routers.services import router as services_router
from app.routers.tasks import router as tasks_router

__all__ = [
    "assistant_router",
    "auth_router",
    "billing_router",
    "clients_router",
    "compliance_router",
    "communications_router",
    "documents_router",
    "financial_years_router",
    "messaging_router",
    "notifications_router",
    "reports_router",
    "services_router",
    "tasks_router",
]
