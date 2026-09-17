import {integer,sqliteTable,text} from 'drizzle-orm/sqlite-core';
export const journalState=sqliteTable('journal_state',{userId:text('user_id').primaryKey(),data:text('data').notNull(),version:integer('version').notNull().default(0)});
