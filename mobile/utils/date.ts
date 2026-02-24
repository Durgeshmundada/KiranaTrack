import { differenceInCalendarDays, format, isSameDay as isSameDayDate, parseISO } from 'date-fns';

export const toDate = (value: string): Date => parseISO(value);

export const formatDisplayDate = (value: string): string => format(toDate(value), 'dd MMM yyyy');

export const formatDisplayDateTime = (value: string): string => format(toDate(value), 'dd MMM yyyy, hh:mm a');

export const daysSince = (value: string): number => differenceInCalendarDays(new Date(), toDate(value));

export const isSameCalendarDay = (a: string, b: Date = new Date()): boolean =>
  isSameDayDate(toDate(a), b);

export const monthKey = (value: string): string => format(toDate(value), 'yyyy-MM');

export const monthLabel = (value: string): string => format(toDate(value), 'MMM yyyy');
