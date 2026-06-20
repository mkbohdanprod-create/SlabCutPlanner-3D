import { get, set, update } from 'idb-keyval';
import { v4 as uuidv4 } from 'uuid';

export type TicketStatus = 'pending' | 'resolved';

export interface BugTicket {
  id: string;
  timestamp: string;
  description: string;
  author: string; // will default to "local" or current user
  status: TicketStatus;
  zipBlob: Blob; // The actual generated .zip archive
}

const TICKETS_KEY = 'slabcut_bug_tickets';

export const ticketStore = {
  async addTicket(description: string, zipBlob: Blob, author: string = 'User') {
    const newTicket: BugTicket = {
      id: uuidv4().substring(0, 8), // short id
      timestamp: new Date().toISOString(),
      description,
      author,
      status: 'pending',
      zipBlob
    };

    await update(TICKETS_KEY, (val: BugTicket[] | undefined) => {
      const tickets = val || [];
      return [newTicket, ...tickets];
    });

    return newTicket;
  },

  async getTickets(): Promise<BugTicket[]> {
    return (await get(TICKETS_KEY)) || [];
  },

  async updateTicketStatus(id: string, status: TicketStatus) {
    await update(TICKETS_KEY, (val: BugTicket[] | undefined) => {
      const tickets = val || [];
      return tickets.map(t => t.id === id ? { ...t, status } : t);
    });
  },

  async deleteTicket(id: string) {
    await update(TICKETS_KEY, (val: BugTicket[] | undefined) => {
      const tickets = val || [];
      return tickets.filter(t => t.id !== id);
    });
  }
};
