import type { TemplateContext } from './utils';
import { renderModern } from './templates/modern';
import { renderClassic } from './templates/classic';
import { renderMinimal } from './templates/minimal';
import { renderCorporate } from './templates/corporate';
import { renderCompact } from './templates/compact';

export type TemplateRenderer = (ctx: TemplateContext) => void;

export type BuiltinTemplate = 'modern' | 'classic' | 'minimal' | 'corporate' | 'compact';

const registry = new Map<string, TemplateRenderer>([
  ['modern', renderModern],
  ['classic', renderClassic],
  ['minimal', renderMinimal],
  ['corporate', renderCorporate],
  ['compact', renderCompact],
]);

export function registerTemplate(name: string, renderer: TemplateRenderer): void {
  registry.set(name, renderer);
}

export function getTemplate(name: string): TemplateRenderer | undefined {
  return registry.get(name);
}

export function listTemplates(): string[] {
  return [...registry.keys()];
}
