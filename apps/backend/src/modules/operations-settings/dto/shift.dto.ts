import { Transform } from 'class-transformer';
import {
  IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min,
} from 'class-validator';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
export const WORKING_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/**
 * Clearing "Break Duration" in the UI sends null (or ''), which @IsOptional
 * waves through — and shifts.break_minutes is NOT NULL, so the insert blew up
 * with a 500. An empty break is zero minutes, so coerce it here rather than
 * relaxing the column. `undefined` is left alone: on a PATCH it means
 * "field not supplied", which must not overwrite the stored value.
 */
const EmptyBreakToZero = () =>
  Transform(({ value }) => (value === null || value === '' ? 0 : value));

export class CreateShiftDto {
  @IsString() @MaxLength(120) name: string;

  @IsOptional() @IsString() @MaxLength(40) code?: string;

  @Matches(TIME_RE, { message: 'startTime must be HH:MM or HH:MM:SS' })
  startTime: string;

  @Matches(TIME_RE, { message: 'endTime must be HH:MM or HH:MM:SS' })
  endTime: string;

  @IsOptional() @EmptyBreakToZero() @IsInt() @Min(0) @Max(720) breakMinutes?: number;

  @IsOptional() @IsArray() @IsIn(WORKING_DAYS as unknown as string[], { each: true })
  workingDays?: string[];

  @IsOptional() @IsIn(['active', 'inactive']) status?: string;
}

export class UpdateShiftDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(40) code?: string;

  @IsOptional() @Matches(TIME_RE, { message: 'startTime must be HH:MM or HH:MM:SS' })
  startTime?: string;

  @IsOptional() @Matches(TIME_RE, { message: 'endTime must be HH:MM or HH:MM:SS' })
  endTime?: string;

  @IsOptional() @EmptyBreakToZero() @IsInt() @Min(0) @Max(720) breakMinutes?: number;

  @IsOptional() @IsArray() @IsIn(WORKING_DAYS as unknown as string[], { each: true })
  workingDays?: string[];

  @IsOptional() @IsIn(['active', 'inactive']) status?: string;
}
