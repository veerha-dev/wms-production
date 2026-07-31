import { IsBoolean, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

/**
 * Settings > Masters > Approval Rules. One row per module
 * (`purchase_orders`, `adjustments`, `transfers`, `cycle_counts`, …).
 */
export class UpdateApprovalRuleDto {
  @IsOptional() @IsNumber() @Min(0) thresholdAmount?: number;

  /** Unit-count threshold, e.g. adjustments above 100 units need approval. */
  @IsOptional() @IsInt() @Min(0) thresholdUnits?: number;

  @IsOptional() @IsBoolean() transferRequiresApproval?: boolean;

  /** Cycle-count variance below this percentage is auto-approved. */
  @IsOptional() @IsNumber() @Min(0) @Max(100) cycleCountAutoApprovePct?: number;

  @IsOptional() @IsBoolean() isActive?: boolean;
}
