/**
 * Realtime LLM request/response observer.
 *
 * Installs a `llm/stream` waterfall listener that tees the fully-assembled
 * model request and stream summary to the logger, without changing the stream.
 * The request arrives deep-frozen and is read only; the listener always calls
 * `next()` and transparently forwards every chunk, so it never short-circuits
 * the model call.
 *
 * This is a diagnostic aid, not a session-log surface: the assembled system
 * prompt and derived history are runtime products that the session log
 * reconstructs rather than stores, so they are observed here in flight.
 *
 * @module @deepseek-ai/dsh-experimental-llm-inspector
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { GenerateOptions, StreamChunk, Message } from '@deepseek-ai/dsh-llm'
import z from '@deepseek-ai/schemastery'

/** Deployment-varying observation switches. */
export interface Config {
  /** Global switch; defaults to `true`. */
  readonly enabled?: boolean
  /** Print full message contents instead of a role/length summary. */
  readonly verbose?: boolean
  /** Maximum characters printed for a truncated field. */
  readonly maxFieldLength?: number
}

const DEFAULT_MAX_FIELD_LENGTH = 400

/** Truncate one field to the configured length, marking the cut. */
function clip(text: string, maxFieldLength: number, verbose: boolean): string {
  return text.length > maxFieldLength && !verbose
    ? `${text.slice(0, maxFieldLength)}…`
    : text
}

/** One message line in the request summary. */
interface MessageSummary {
  role: Message['role']
  length: number
  preview: string
}

/** Summarize one message without echoing its full content. */
function summarizeMessage(message: Message, maxFieldLength: number, verbose: boolean): MessageSummary {
  // A single lossless-JSON snapshot of the message text is the only safe
  // preview source: content blocks and sources are heterogeneous.
  const json = JSON.stringify(message)
  const length = json.length
  const preview = verbose
    ? json
    : json.length > maxFieldLength ? `${json.slice(0, maxFieldLength)}…` : json
  return { role: message.role, length, preview }
}

/** Render one model request as an indented, human-readable block. */
function formatRequest(options: GenerateOptions, maxFieldLength: number, verbose: boolean): string {
  const system = clip(options.system ?? '', maxFieldLength, verbose)
  const lines: string[] = [
    'provider      : ' + options.provider,
    'model         : ' + options.model,
    'reasoning     : ' + String(options.reasoningEffort ?? '-'),
    'temperature   : ' + String(options.temperature ?? '-'),
    'maxTokens     : ' + String(options.maxTokens ?? '-'),
    'stop          : ' + (options.stop === undefined ? '-' : JSON.stringify(options.stop)),
    'purpose       : ' + String(options.purpose ?? 'conversation'),
    'tool schemas  : ' + String(options.tools?.length ?? 0),
    'messages      : ' + String(options.messages.length),
  ]
  lines.push('--- system prompt ---')
  lines.push(system)
  lines.push('--- messages ---')
  for (const message of options.messages) {
    const summary = summarizeMessage(message, maxFieldLength, verbose)
    lines.push(`[${summary.role}] (${summary.length} chars)`)
    lines.push(summary.preview)
  }
  return lines.join('\n')
}

/** Render one model response summary as an indented block. */
function formatResponse(chunkCount: number, usage: Record<string, unknown> | undefined, finish: string | undefined): string {
  const lines: string[] = ['chunks : ' + String(chunkCount)]
  if (usage !== undefined) {
    lines.push('usage  : ' + JSON.stringify(usage))
  }
  lines.push('finish : ' + String(finish ?? '-'))
  return lines.join('\n')
}

/**
 * Realtime model-call observer service. Registers no `ctx` key; it is a pure
 * observer that emits diagnostics through the logger.
 */
export class LlmInspector extends Service {
  static Config: z<Config> = z.object({
    enabled: z.boolean().default(true),
    verbose: z.boolean().default(false),
    maxFieldLength: z.number().step(1).min(1).default(DEFAULT_MAX_FIELD_LENGTH),
  })

  private readonly enabled: boolean
  private readonly verbose: boolean
  private readonly maxFieldLength: number

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'llmInspector')
    this.enabled = config.enabled ?? true
    this.verbose = config.verbose ?? false
    this.maxFieldLength = config.maxFieldLength ?? DEFAULT_MAX_FIELD_LENGTH
    if (this.enabled) this.ctx.on('llm/stream', (options, next) => this.observe(options, next))
  }

  /**
   * Emit one observation block to stderr. Diagnostics bypass the Cordis logger
   * because one-shot profiles (headless) mount no console backend, so logger
   * output would be silently dropped.
   * @param title - the block title, printed on its own separator line.
   * @param body - the pre-formatted multi-line block.
   */
  private write(title: string, body: string): void {
    const separator = '='.repeat(72)
    process.stderr.write(`\n${separator}\n${title}\n${separator}\n${body}\n${separator}\n`)
  }

  /**
   * Tee one model call: forward the stream untouched while summarizing its
   * request and outcome.
   * @param options - the fully-assembled, deep-frozen request.
   * @param next - delegates to the resolved adapter stream.
   * @returns the underlying stream, forwarded chunk-for-chunk.
   */
  private async * observe(
    options: GenerateOptions,
    next: () => AsyncIterable<StreamChunk>,
  ): AsyncIterable<StreamChunk> {
    this.write('LLM REQUEST', formatRequest(options, this.maxFieldLength, this.verbose))

    let chunkCount = 0
    let usage: Record<string, unknown> | undefined
    let finish: string | undefined
    for await (const chunk of next()) {
      chunkCount += 1
      if (chunk.type === 'usage') usage = { ...chunk.usage }
      if (chunk.type === 'finish') finish = JSON.stringify(chunk.reason)
      yield chunk
    }

    this.write('LLM RESPONSE', formatResponse(chunkCount, usage, finish))
  }
}

export default LlmInspector
