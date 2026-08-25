import { trace, SpanStatusCode, context, Span } from '@opentelemetry/api';
import { BasicTracerProvider, SimpleSpanProcessor, InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const TRACER_NAME = 'agent-passport';

let provider: BasicTracerProvider | NodeTracerProvider | null = null;
let memoryExporter: InMemorySpanExporter | null = null;

export function initTelemetry(serviceName = 'agent-passport'): string {
  memoryExporter = new InMemorySpanExporter();
  provider = new NodeTracerProvider({
    resource: new Resource({ [ATTR_SERVICE_NAME]: serviceName }),
  });
  provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
  provider.register();
  return trace.getTracer(TRACER_NAME).startSpan('telemetry.init').spanContext().traceId;
}

export function getTracer() {
  return trace.getTracer(TRACER_NAME);
}

export function startRunSpan(runId: string, projectId: string, traceId?: string): Span {
  const tracer = getTracer();
  return tracer.startSpan('agent.run', {
    attributes: {
      'agent.run_id': runId,
      'agent.project_id': projectId,
      ...(traceId ? { 'agent.trace_id': traceId } : {}),
    },
  });
}

export function startRoleSwitchSpan(fromShell: string, toShell: string, reason?: string): Span {
  return getTracer().startSpan('agent.role_switch', {
    attributes: {
      'agent.from_shell': fromShell,
      'agent.to_shell': toShell,
      ...(reason ? { 'agent.switch_reason': reason } : {}),
    },
  });
}

export function startPolicyCheckSpan(action: string, resource: string, decision: string, ruleIds: string[]): Span {
  return getTracer().startSpan('policy.check', {
    attributes: {
      'policy.action': action,
      'policy.resource': resource,
      'policy.decision': decision,
      'policy.rule_ids': ruleIds.join(','),
    },
  });
}

export function startToolCallSpan(toolName: string, adapter: string, action: string, resource: string): Span {
  return getTracer().startSpan('tool.call', {
    attributes: {
      'tool.name': toolName,
      'tool.adapter': adapter,
      'tool.action': action,
      'tool.resource': resource,
    },
  });
}

export function endSpanSuccess(span: Span, attrs?: Record<string, string | number | boolean>): void {
  if (attrs) span.setAttributes(attrs);
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

export function endSpanError(span: Span, message: string): void {
  span.setStatus({ code: SpanStatusCode.ERROR, message });
  span.end();
}

export function withSpan<T>(span: Span, fn: () => T): T {
  return context.with(trace.setSpan(context.active(), span), fn);
}

export function getExportedSpans() {
  return memoryExporter?.getFinishedSpans() ?? [];
}

export function getTraceId(): string | undefined {
  const spans = getExportedSpans();
  return spans[0]?.spanContext().traceId;
}

export function shutdownTelemetry(): Promise<void> {
  return provider?.shutdown() ?? Promise.resolve();
}

export { memoryExporter };
