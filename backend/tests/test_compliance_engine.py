"""Tests for the compliance engine and compliance record operations."""
import uuid
import pytest
from app.core.db import SessionLocal
from app.core.clock import today_local
from app.models import ComplianceRule, Registration, Deadline
from app.services.compliance_engine import (
    evaluate_rule_for_client, _get_required_registration, _compute_next_due_date,
    DeadlineResult,
)


class TestComplianceEngineUnit:
    """Unit tests for the compliance engine service functions."""

    def test_required_registration_from_applicability_rule(self, db_session):
        rule = ComplianceRule(
            id=uuid.uuid4(),
            tenant_id=uuid.UUID("11111111-1111-1111-1111-111111111111"),
            code="TEST001",
            name="Test Rule",
            category="gst",
            applicability_rule="gst",
            default_frequency="monthly",
            lead_days=14,
            status="active",
        )
        db_session.add(rule)
        db_session.commit()

        assert _get_required_registration(rule) == "gst"

        rule.applicability_rule = None
        assert _get_required_registration(rule) is None

    def test_compute_due_date_monthly(self, db_session):
        from datetime import date
        rule = ComplianceRule(
            id=uuid.uuid4(),
            tenant_id=uuid.UUID("11111111-1111-1111-1111-111111111111"),
            code="TEST002",
            name="Monthly Rule",
            category="gst",
            default_frequency="monthly",
            lead_days=14,
            status="active",
        )
        db_session.add(rule)
        db_session.commit()

        today = date(2026, 10, 15)
        due = _compute_next_due_date(rule, today, db=db_session)
        assert due is not None
        assert due.day == 31
        assert due.month == 10

    def test_compute_due_date_unknown_frequency(self, db_session):
        from datetime import date
        rule = ComplianceRule(
            id=uuid.uuid4(),
            tenant_id=uuid.UUID("11111111-1111-1111-1111-111111111111"),
            code="TEST003",
            name="Unknown Freq",
            category="other",
            default_frequency=None,
            lead_days=14,
            status="active",
        )
        db_session.add(rule)
        db_session.commit()

        today = date(2026, 10, 15)
        due = _compute_next_due_date(rule, today, db=db_session)
        assert due is None

    def test_compute_due_date_yearly_with_fy(self, db_session):
        from datetime import date
        from app.models import FinancialYear
        rule = ComplianceRule(
            id=uuid.uuid4(),
            tenant_id=uuid.UUID("11111111-1111-1111-1111-111111111111"),
            code="TEST004",
            name="Yearly Rule",
            category="income_tax",
            default_frequency="yearly",
            lead_days=14,
            status="active",
        )
        db_session.add(rule)
        fy = FinancialYear(
            id=uuid.uuid4(),
            tenant_id=uuid.UUID("11111111-1111-1111-1111-111111111111"),
            code=f"FY-{uuid.uuid4().hex[:8]}",
            label="FY 2026",
            start_date=date(2026, 4, 1),
            end_date=date(2027, 3, 31),
            is_active=True,
        )
        db_session.add(fy)
        db_session.commit()

        today = date(2026, 10, 15)
        due = _compute_next_due_date(rule, today, db=db_session, financial_year_id=str(fy.id))
        assert due is not None
        assert due == date(2027, 3, 31)


class TestEvaluateRuleForClient:
    """Integration tests for evaluate_rule_for_client."""

    def test_rule_not_found(self, db_session):
        result = evaluate_rule_for_client(
            db_session,
            "00000000-0000-0000-0000-000000000000",
            "00000000-0000-0000-0000-000000000000",
        )
        assert result.applies is False
        assert "not found" in result.reason

    def test_rule_without_registration_requirement(self, db_session, tenant_ctx):
        rule = ComplianceRule(
            id=uuid.uuid4(),
            tenant_id=uuid.UUID(tenant_ctx["tenant_id"]),
            code="EVAL001",
            name="No Reg Required",
            category="gst",
            applicability_rule=None,
            default_frequency="monthly",
            lead_days=14,
            status="active",
        )
        db_session.add(rule)
        db_session.commit()

        result = evaluate_rule_for_client(
            db_session, str(rule.id), tenant_ctx["client_id"]
        )
        assert result.applies is True
        assert result.statutory_due_date is not None
        assert result.required_registration is None

    def test_rule_with_registration_client_has_it(self, db_session, tenant_ctx):
        rule = ComplianceRule(
            id=uuid.uuid4(),
            tenant_id=uuid.UUID(tenant_ctx["tenant_id"]),
            code="EVAL002",
            name="Requires GST",
            category="gst",
            applicability_rule="gst",
            default_frequency="monthly",
            lead_days=14,
            status="active",
        )
        db_session.add(rule)

        reg = Registration(
            id=uuid.uuid4(),
            tenant_id=uuid.UUID(tenant_ctx["tenant_id"]),
            client_id=uuid.UUID(tenant_ctx["client_id"]),
            registration_type="gst",
            number="27AABCT1234F1Z5",
            status="active",
        )
        db_session.add(reg)
        db_session.commit()

        result = evaluate_rule_for_client(
            db_session, str(rule.id), tenant_ctx["client_id"]
        )
        assert result.applies is True
        assert result.required_registration == "gst"

    def test_rule_with_registration_client_lacks_it(self, db_session, tenant_ctx):
        rule = ComplianceRule(
            id=uuid.uuid4(),
            tenant_id=uuid.UUID(tenant_ctx["tenant_id"]),
            code="EVAL003",
            name="Requires ITR",
            category="income_tax",
            applicability_rule="itr_filing",
            default_frequency="yearly",
            lead_days=30,
            status="active",
        )
        db_session.add(rule)
        db_session.commit()

        result = evaluate_rule_for_client(
            db_session, str(rule.id), tenant_ctx["client_id"]
        )
        assert result.applies is False
        assert result.required_registration == "itr_filing"
