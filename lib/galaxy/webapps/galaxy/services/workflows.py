import logging
from typing import (
    Any,
    Dict,
    List,
    Optional,
    Tuple,
)

from galaxy import web
from galaxy.managers.context import ProvidesUserContext
from galaxy.managers.notification import NotificationManager
from galaxy.managers.workflows import (
    WorkflowContentsManager,
    WorkflowSerializer,
    WorkflowsManager,
)
from galaxy.model import StoredWorkflow
from galaxy.schema.schema import (
    InvocationsStateCounts,
    WorkflowIndexQueryPayload,
)
from galaxy.util.tool_shed.tool_shed_registry import Registry
from galaxy.webapps.galaxy.services.base import ServiceBase
from galaxy.webapps.galaxy.services.sharable import ShareableService

log = logging.getLogger(__name__)


class WorkflowIndexPayload(WorkflowIndexQueryPayload):
    missing_tools: bool = False


class WorkflowsService(ServiceBase):
    def __init__(
        self,
        workflows_manager: WorkflowsManager,
        workflow_contents_manager: WorkflowContentsManager,
        serializer: WorkflowSerializer,
        tool_shed_registry: Registry,
        notification_manager: NotificationManager,
    ):
        self._workflows_manager = workflows_manager
        self._workflow_contents_manager = workflow_contents_manager
        self._serializer = serializer
        self.shareable_service = ShareableService(workflows_manager, serializer, notification_manager)
        self._tool_shed_registry = tool_shed_registry

    def index(
        self,
        trans: ProvidesUserContext,
        payload: WorkflowIndexPayload,
        include_total_count: bool = False,
    ) -> Tuple[List[Dict[str, Any]], Optional[int]]:
        user = trans.user
        missing_tools = payload.missing_tools
        query, total_matches = self._workflows_manager.index_query(trans, payload, include_total_count)
        rval = []
        for wf in query.all():
            item = wf.to_dict(value_mapper={"id": trans.security.encode_id})
            encoded_id = trans.security.encode_id(wf.id)
            item["annotations"] = [x.annotation for x in wf.annotations]
            item["url"] = web.url_for("workflow", id=encoded_id)
            item["owner"] = wf.user.username
            item["source_metadata"] = wf.latest_workflow.source_metadata
            if not payload.skip_step_counts:
                item["number_of_steps"] = wf.latest_workflow.step_count
            item["show_in_tool_panel"] = False
            if user is not None:
                item["show_in_tool_panel"] = wf.show_in_tool_panel(user_id=user.id)
            rval.append(item)
        if missing_tools:
            workflows_missing_tools = []
            workflows = []
            workflows_by_toolshed = dict()
            for value in rval:
                stored_workflow = self._workflows_manager.get_stored_workflow(trans, value["id"], by_stored_id=True)
                tools = self._workflow_contents_manager.get_all_tools(stored_workflow.latest_workflow)
                missing_tool_ids = [
                    tool["tool_id"] for tool in tools if trans.app.toolbox.is_missing_shed_tool(tool["tool_id"])
                ]
                if len(missing_tool_ids) > 0:
                    value["missing_tools"] = missing_tool_ids
                    workflows_missing_tools.append(value)
            for workflow in workflows_missing_tools:
                for tool_id in workflow["missing_tools"]:
                    toolshed, _, owner, name, tool, version = tool_id.split("/")
                    shed_url = self.__get_full_shed_url(toolshed)
                    repo_identifier = "/".join((toolshed, owner, name))
                    if repo_identifier not in workflows_by_toolshed:
                        workflows_by_toolshed[repo_identifier] = dict(
                            shed=shed_url.rstrip("/"),
                            repository=name,
                            owner=owner,
                            tools=[tool_id],
                            workflows=[workflow["name"]],
                        )
                    else:
                        if tool_id not in workflows_by_toolshed[repo_identifier]["tools"]:
                            workflows_by_toolshed[repo_identifier]["tools"].append(tool_id)
                        if workflow["name"] not in workflows_by_toolshed[repo_identifier]["workflows"]:
                            workflows_by_toolshed[repo_identifier]["workflows"].append(workflow["name"])
            for repo_tag in workflows_by_toolshed:
                workflows.append(workflows_by_toolshed[repo_tag])
            return workflows, total_matches
        return rval, total_matches

    # def invoke_workflow(self, trans, workflow_id, payload):
    #     # Get workflow + accessibility check.
    #     stored_workflow = self._workflows_manager.get_stored_accessible_workflow(
    #         trans, workflow_id, instance=payload.get("instance", False)
    #     )
    #     workflow = stored_workflow.latest_workflow
    #     run_configs = build_workflow_run_configs(trans, workflow, payload)
    #     is_batch = payload.get("batch")
    #     if not is_batch and len(run_configs) != 1:
    #         raise HTTPException(status_code=400, detail="Must specify 'batch' to use batch parameters.")

    #     require_exact_tool_versions = util.string_as_bool(payload.get("require_exact_tool_versions", "true"))
    #     tools = self._workflow_contents_manager.get_all_tools(workflow)
    #     missing_tools = [
    #         tool
    #         for tool in tools
    #         if not self.app.toolbox.has_tool(
    #             tool["tool_id"], tool_version=tool["tool_version"], exact=require_exact_tool_versions
    #         )
    #     ]
    #     if missing_tools:
    #         missing_tools_message = "Workflow was not invoked; the following required tools are not installed: "
    #         if require_exact_tool_versions:
    #             missing_tools_message += ", ".join(
    #                 [f"{tool['tool_id']} (version {tool['tool_version']})" for tool in missing_tools]
    #             )
    #         else:
    #             missing_tools_message += ", ".join([tool["tool_id"] for tool in missing_tools])
    #         raise HTTPException(status_code=400, detail=missing_tools_message)
    #     # if missing_tools:
    #     #     missing_tools_message = "Workflow was not invoked; the following required tools are not installed: "
    #     #     if require_exact_tool_versions:
    #     #         missing_tools_message += ", ".join(
    #     #             [f"{tool['tool_id']} (version {tool['tool_version']})" for tool in missing_tools]
    #     #         )
    #     #     else:
    #     #         missing_tools_message += ", ".join([tool["tool_id"] for tool in missing_tools])
    #     #     raise exceptions.MessageException(missing_tools_message)

    #     invocations = []
    #     for run_config in run_configs:
    #         workflow_scheduler_id = payload.get("scheduler", None)
    #         # TODO: workflow scheduler hints
    #         work_request_params = dict(scheduler=workflow_scheduler_id)
    #         workflow_invocation = queue_invoke(
    #             trans=trans,
    #             workflow=workflow,
    #             workflow_run_config=run_config,
    #             request_params=work_request_params,
    #             flush=False,
    #         )
    #         invocations.append(workflow_invocation)

    #     with transaction(trans.sa_session):
    #         trans.sa_session.commit()
    #     encoded_invocations = []
    #     for invocation in invocations:
    #         as_dict = workflow_invocation.to_dict()
    #         as_dict = self.encode_all_ids(trans, as_dict, recursive=True)
    #         as_dict["messages"] = [
    #             InvocationMessageResponseModel.model_validate(message).model_dump(mode="json")
    #             for message in invocation.messages
    #         ]
    #         encoded_invocations.append(as_dict)

    #     if is_batch:
    #         return encoded_invocations
    #     else:
    #         return encoded_invocations[0]

    def delete(self, trans, workflow_id):
        workflow_to_delete = self._workflows_manager.get_stored_workflow(trans, workflow_id)
        self._workflows_manager.check_security(trans, workflow_to_delete)
        self._workflows_manager.delete(workflow_to_delete)

    def undelete(self, trans, workflow_id):
        workflow_to_undelete = self._workflows_manager.get_stored_workflow(trans, workflow_id)
        self._workflows_manager.check_security(trans, workflow_to_undelete)
        self._workflows_manager.undelete(workflow_to_undelete)

    def get_versions(self, trans, workflow_id, instance: bool):
        stored_workflow: StoredWorkflow = self._workflows_manager.get_stored_accessible_workflow(
            trans, workflow_id, by_stored_id=not instance
        )
        return [
            {"version": i, "update_time": w.update_time.isoformat(), "steps": len(w.steps)}
            for i, w in enumerate(reversed(stored_workflow.workflows))
        ]

    def invocation_counts(self, trans, workflow_id, instance: bool) -> InvocationsStateCounts:
        stored_workflow: StoredWorkflow = self._workflows_manager.get_stored_accessible_workflow(
            trans, workflow_id, by_stored_id=not instance
        )
        return stored_workflow.invocation_counts()

    def get_workflow_menu(self, trans, payload):
        ids_in_menu = [x.stored_workflow_id for x in trans.user.stored_workflow_menu_entries]
        workflows = self._get_workflows_list(
            trans,
            payload,
        )
        return {"ids_in_menu": ids_in_menu, "workflows": workflows}

    def _get_workflows_list(
        self,
        trans: ProvidesUserContext,
        payload,
    ):
        workflows, _ = self.index(trans, payload)
        return workflows

    def __get_full_shed_url(self, url):
        for shed_url in self._tool_shed_registry.tool_sheds.values():
            if url in shed_url:
                return shed_url
        return None
