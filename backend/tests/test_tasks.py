"""Tests for task creation, numbering, and assignment through MCP."""
import json
import urllib.request
import urllib.error
from app.core.security import create_access_token


class TestTaskOperations:
    MCP_URL = "http://127.0.0.1:8000/mcp/"

    def _call_mcp(self, token, method_name, params):
        payload = json.dumps({
            "jsonrpc": "2.0", "id": 1,
            "method": "tools/call",
            "params": {"name": method_name, "arguments": params},
        })
        headers = {
            "Accept": "application/json, text/event-stream",
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        }
        req = urllib.request.Request(self.MCP_URL, data=payload.encode(), headers=headers, method="POST")
        resp = urllib.request.urlopen(req, timeout=10)
        data = resp.read().decode()
        line = [l for l in data.split("\n") if l.startswith("data: ")][0]
        parsed = json.loads(line[6:])
        return resp.status, json.loads(parsed["result"]["content"][0]["text"])

    def test_create_multiple_tasks_unique_codes(self, test_token, tenant_ctx):
        client_id = tenant_ctx["client_id"]
        codes = []
        for i in range(3):
            status, result = self._call_mcp(test_token, "create_task", {
                "client_id": client_id, "name": f"Workflow Task {i}"
            })
            assert status == 200
            assert "task_code" in result
            codes.append(result["task_code"])
        assert len(set(codes)) == 3, f"Duplicate codes: {codes}"

    def test_task_parameter_alias(self, test_token, tenant_ctx):
        client_id = tenant_ctx["client_id"]
        status, result = self._call_mcp(test_token, "create_task", {
            "client_id": client_id, "title": "Alias Test Task"
        })
        assert status == 200
        assert result["title"] == "Alias Test Task"

    def test_assign_task(self, test_token, tenant_ctx):
        client_id = tenant_ctx["client_id"]
        user_id = tenant_ctx["user_id"]

        status, result = self._call_mcp(test_token, "create_task", {
            "client_id": client_id, "name": "Assignment Test Task"
        })
        task_id = result["id"]

        status, result = self._call_mcp(test_token, "assign_task", {
            "task_id": task_id, "role": "preparer", "user_id": user_id
        })
        assert status == 200
        assert result["success"] is True
        assert result["user_name"] == "Test User"

    def test_update_task(self, test_token, tenant_ctx):
        client_id = tenant_ctx["client_id"]

        status, result = self._call_mcp(test_token, "create_task", {
            "client_id": client_id, "name": "Update Test Task"
        })
        task_id = result["id"]

        status, result = self._call_mcp(test_token, "update_task", {
            "task_id": task_id, "title": "Updated Title", "priority": "high"
        })
        assert status == 200
        assert result["title"] == "Updated Title"
        assert result["priority"] == "high"

    def test_status_transition(self, test_token, tenant_ctx):
        client_id = tenant_ctx["client_id"]

        status, result = self._call_mcp(test_token, "create_task", {
            "client_id": client_id, "name": "Status Test Task"
        })
        task_id = result["id"]

        status, result = self._call_mcp(test_token, "update_task_status", {
            "task_id": task_id, "status": "in_progress"
        })
        assert status == 200
        assert result["new_status"] == "in_progress"

    def test_delete_task(self, test_token, tenant_ctx):
        """A user with task.delete can soft-delete a task via REST."""
        client_id = tenant_ctx["client_id"]
        status, result = self._call_mcp(test_token, "create_task", {
            "client_id": client_id, "name": "Delete Test Task"
        })
        task_id = result["id"]

        req = urllib.request.Request(
            f"{self.MCP_URL.replace('/mcp/', f'/tasks/{task_id}')}",
            headers={"Authorization": f"Bearer {test_token}"},
            method="DELETE",
        )
        resp = urllib.request.urlopen(req, timeout=10)
        assert resp.status == 200

        # Verify the task no longer appears in the list
        list_req = urllib.request.Request(
            f"{self.MCP_URL.replace('/mcp/', '/tasks')}",
            headers={"Authorization": f"Bearer {test_token}"},
        )
        list_resp = urllib.request.urlopen(list_req, timeout=10)
        data = json.loads(list_resp.read())
        ids = [t["id"] for t in data["items"]]
        assert task_id not in ids

    def test_delete_task_requires_permission(self, tenant_ctx):
        """A user without task.delete gets 403."""
        from app.core.security import create_access_token
        token = create_access_token(
            subject=tenant_ctx["user_id"],
            tenant_id=tenant_ctx["tenant_id"],
            roles=["article_assistant"],
            permissions=["task.read"],
        )
        req = urllib.request.Request(
            f"{self.MCP_URL.replace('/mcp/', f'/tasks/{tenant_ctx['client_id']}')}",
            headers={"Authorization": f"Bearer {token}"},
            method="DELETE",
        )
        try:
            urllib.request.urlopen(req, timeout=10)
            assert False, "should have raised"
        except urllib.error.HTTPError as exc:
            assert exc.code == 403
