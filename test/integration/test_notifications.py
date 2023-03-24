from datetime import datetime
from typing import (
    Any,
    Dict,
    List,
    Optional,
)
from uuid import uuid4

from galaxy_test.base.populators import (
    DatasetPopulator,
    WorkflowPopulator,
)
from galaxy_test.driver.integration_util import IntegrationTestCase


def notification_test_data(subject: Optional[str] = None, message: Optional[str] = None):
    return {
        "source": "integration_tests",
        "variant": "info",
        "category": "message",
        "content": {
            "category": "message",
            "subject": subject or "Testing Subject",
            "message": message or "Testing Message",
        },
    }


class TestNotificationsIntegration(IntegrationTestCase):
    task_based = False
    framework_tool_and_types = False

    @classmethod
    def handle_galaxy_config_kwds(cls, config):
        super().handle_galaxy_config_kwds(config)
        config["enable_notification_system"] = True

    def setUp(self):
        super().setUp()
        self.dataset_populator = DatasetPopulator(self.galaxy_interactor)
        self.workflow_populator = WorkflowPopulator(self.galaxy_interactor)

    def test_notification_status(self):
        user1 = self._create_test_user()
        user2 = self._create_test_user()

        before_creating_notifications = datetime.utcnow()

        # Only user1 will receive this notification
        created_response = self._send_test_notification_to([user1["id"]], message="test_notification_status 1")
        assert created_response["total_notifications_sent"] == 1

        # Both user1 and user2 will receive this notification
        created_response = self._send_test_notification_to([user1["id"], user2["id"]], "test_notification_status 2")
        assert created_response["total_notifications_sent"] == 2

        # All users will receive this broadcasted notification
        created_response = self._send_broadcast_notification("test_notification_status 3")
        assert created_response["total_notifications_sent"] == 1

        after_creating_notifications = datetime.utcnow()

        # The default user should have received only the broadcasted notifications
        status = self._get_notifications_status_since(before_creating_notifications)
        assert status["total_unread_count"] == 0
        assert len(status["notifications"]) == 0
        assert len(status["broadcasts"]) == 1

        with self._different_user(user1["email"]):
            status = self._get_notifications_status_since(before_creating_notifications)
            assert status["total_unread_count"] == 2
            assert len(status["notifications"]) == 2
            assert len(status["broadcasts"]) == 1
            # Mark one unseen notification as seen
            unseen_notification = status["notifications"][0]["id"]
            self._update_notification(unseen_notification, update_state={"seen": True})
            status = self._get_notifications_status_since(before_creating_notifications)
            # The total unread count should be updated
            assert status["total_unread_count"] == 1
            assert len(status["notifications"]) == 2
            assert len(status["broadcasts"]) == 1

        with self._different_user(user2["email"]):
            status = self._get_notifications_status_since(before_creating_notifications)
            assert status["total_unread_count"] == 1
            assert len(status["notifications"]) == 1
            assert len(status["broadcasts"]) == 1

            # Getting the notifications status since a posterior date does not return notifications
            # but the total number of unread notifications is maintained
            status = self._get_notifications_status_since(after_creating_notifications)
            assert status["total_unread_count"] == 1
            assert len(status["notifications"]) == 0
            assert len(status["broadcasts"]) == 0

        with self._different_user(anon=True):
            # Anonymous users can access broadcasted notifications
            status = self._get_notifications_status_since(before_creating_notifications)
            assert status["total_unread_count"] == 0
            assert len(status["notifications"]) == 0
            assert len(status["broadcasts"]) == 1

    def test_user_cannot_access_other_users_notifications(self):
        user1 = self._create_test_user()
        user2 = self._create_test_user()

        created_response = self._send_test_notification_to(
            [user1["id"]], message="test_user_cannot_access_other_users_notifications"
        )
        notification_id = created_response["notification"]["id"]

        with self._different_user(user1["email"]):
            response = self._get(f"notifications/{notification_id}")
            self._assert_status_code_is_ok(response)

        with self._different_user(user2["email"]):
            response = self._get(f"notifications/{notification_id}")
            self._assert_status_code_is(response, 404)

    def test_delete_notification_by_user(self):
        user1 = self._create_test_user()
        user2 = self._create_test_user()

        before_creating_notifications = datetime.utcnow()

        created_response = self._send_test_notification_to(
            [user1["id"], user2["id"]], message="test_delete_notification_by_user"
        )
        assert created_response["total_notifications_sent"] == 2
        notification_id = created_response["notification"]["id"]

        with self._different_user(user1["email"]):
            response = self._get(f"notifications/{notification_id}")
            self._assert_status_code_is_ok(response)
            self._delete(f"notifications/{notification_id}")
            # After delete, it is no longer available for this user
            response = self._get(f"notifications/{notification_id}")
            self._assert_status_code_is(response, 404)
            status = self._get_notifications_status_since(before_creating_notifications)
            assert status["total_unread_count"] == 0
            assert len(status["notifications"]) == 0
            assert len(status["broadcasts"]) == 0

        with self._different_user(user2["email"]):
            response = self._get(f"notifications/{notification_id}")
            self._assert_status_code_is_ok(response)

    def test_non_admin_users_cannot_create_notifications(self):
        user = self._create_test_user()
        request = {
            "recipients": {"user_ids": [user["id"]]},
            "notification": notification_test_data(),
        }
        response = self._post("notifications", data=request, json=True)
        self._assert_status_code_is(response, 403)

        with self._different_user(anon=True):
            response = self._post("notifications", data=request, json=True)
            self._assert_status_code_is(response, 403)

    def test_sharing_items_creates_notifications_when_expected(self):
        user1 = self._create_test_user()
        user2 = self._create_test_user()
        user_ids = [user1["id"], user2["id"]]

        # User2 doesn't want to receive shared item notifications
        with self._different_user(user2["email"]):
            update_request = {
                "preferences": {"new_shared_item": {"enabled": False, "channels": {"push": False}}},
            }
            update_response = self._put("notifications/preferences", data=update_request, json=True)
            self._assert_status_code_is_ok(update_response)

        # Share History with both users
        history_id = self.dataset_populator.new_history("Notification test history")
        self.dataset_populator.new_dataset(history_id)
        payload = {"user_ids": user_ids, "share_option": "make_accessible_to_shared"}
        sharing_response = self._put(f"histories/{history_id}/share_with_users", data=payload, json=True)
        self._assert_status_code_is_ok(sharing_response)

        # Share Workflow with both users
        workflow_id = self.workflow_populator.simple_workflow("Notification test workflow")
        payload = {"user_ids": user_ids}
        sharing_response = self._put(f"workflows/{workflow_id}/share_with_users", data=payload, json=True)
        self._assert_status_code_is_ok(sharing_response)

        # Share Page with both users
        page_id = self.dataset_populator.new_page(slug="notification-test-page")["id"]
        payload = {"user_ids": user_ids}
        sharing_response = self._put(f"pages/{page_id}/share_with_users", data=payload, json=True)
        self._assert_status_code_is_ok(sharing_response)

        # Share Visualization with both users
        create_payload = {
            "title": "Notification test visualization",
            "slug": "notification-test-viz",
            "type": "example",
            "dbkey": "hg17",
        }
        response = self._post("visualizations", data=create_payload).json()
        visualization_id = response["id"]
        payload = {"user_ids": user_ids}
        sharing_response = self._put(f"visualizations/{visualization_id}/share_with_users", data=payload, json=True)
        self._assert_status_code_is_ok(sharing_response)

        with self._different_user(user1["email"]):
            notifications = self._get("notifications").json()
            assert len(notifications) == 4

        with self._different_user(user2["email"]):
            notifications = self._get("notifications").json()
            assert len(notifications) == 0

    def _create_test_user(self):
        user = self._setup_user(f"{uuid4()}@galaxy.test")
        return user

    def _get_notifications_status_since(self, since: datetime):
        status_response = self._get(f"notifications/status?since={since}")
        self._assert_status_code_is_ok(status_response)
        status = status_response.json()
        return status

    def _send_test_notification_to(
        self, user_ids: List[str], subject: Optional[str] = None, message: Optional[str] = None
    ):
        request = {
            "recipients": {"user_ids": user_ids},
            "notification": notification_test_data(subject, message),
        }
        response = self._post("notifications", data=request, admin=True, json=True)
        self._assert_status_code_is_ok(response)
        created_response = response.json()
        return created_response

    def _send_broadcast_notification(self, subject: Optional[str] = None, message: Optional[str] = None):
        payload = {
            "source": "integration_tests",
            "variant": "urgent",
            "category": "broadcast",
            "content": {
                "category": "broadcast",
                "subject": subject or "Testing Broadcast",
                "message": message or "Testing Broadcast Message",
            },
        }
        response = self._post("notifications/broadcast", data=payload, admin=True, json=True)
        self._assert_status_code_is_ok(response)
        notifications_status = response.json()
        return notifications_status

    def _update_notification(self, notification_id: str, update_state: Dict[str, Any]):
        update_response = self._put(f"notifications/{notification_id}", data=update_state, json=True)
        self._assert_status_code_is(update_response, 204)
