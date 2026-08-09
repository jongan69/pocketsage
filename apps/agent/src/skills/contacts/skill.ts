import * as Contacts from 'expo-contacts/legacy';
import type { Skill } from '@pocketsage/agent-runtime';

async function requestPermission(): Promise<boolean> {
  try {
    const { status } = await Contacts.getPermissionsAsync();
    if (status === 'granted') return true;
    const { granted } = await Contacts.requestPermissionsAsync();
    return granted;
  } catch {
    return false;
  }
}

function formatContact(c: Contacts.ExistingContact) {
  return {
    id: c.id,
    name: c.name ?? '',
    firstName: c.firstName ?? null,
    lastName: c.lastName ?? null,
    company: c.company ?? null,
    jobTitle: c.jobTitle ?? null,
    phoneNumbers: (c.phoneNumbers ?? []).map((p) => ({
      label: p.label ?? 'other',
      number: p.number ?? '',
    })),
    emails: (c.emails ?? []).map((e) => ({
      label: e.label ?? 'other',
      email: e.email ?? '',
    })),
    imageAvailable: !!c.imageAvailable,
  };
}

export const contactsSkill: Skill = {
  metadata: {
    name: 'contacts',
    description: 'Search and look up people in your address book',
    version: '0.1.0',
    keywords: ['contact', 'contacts', 'person', 'people', 'phone', 'email', 'address', 'look up', 'find'],
    triggers: [
      'find contact',
      'look up',
      "who's phone number",
      'search contacts',
      'in my contacts',
      'contact info',
      'get in touch with',
    ],
  },
  tools: {
    'contacts.search': {
      definition: {
        name: 'contacts.search',
        description: 'Search contacts by name or company. Returns up to 10 matches.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Name or company to search for' },
          },
          required: ['query'],
        },
        requiresConfirmation: false,
      },
      execute: async ({ query }) => {
        const permitted = await requestPermission();
        if (!permitted) throw new Error('Contacts permission not granted.');

        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.Name, Contacts.Fields.Company, Contacts.Fields.JobTitle],
          name: query as string,
          pageSize: 10,
        });
        const contacts = (data ?? []).map(formatContact);

        return {
          query: query as string,
          count: contacts.length,
          contacts,
        };
      },
    },

    'contacts.get': {
      definition: {
        name: 'contacts.get',
        description: 'Get full details for a specific contact by ID',
        parameters: {
          type: 'object',
          properties: {
            contactId: { type: 'string', description: 'The contact ID' },
          },
          required: ['contactId'],
        },
        requiresConfirmation: false,
      },
      execute: async ({ contactId }) => {
        const permitted = await requestPermission();
        if (!permitted) throw new Error('Contacts permission not granted.');

        const contact = await Contacts.getContactByIdAsync(contactId as string, [
          Contacts.Fields.Name,
          Contacts.Fields.Company,
          Contacts.Fields.JobTitle,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Emails,
          Contacts.Fields.Addresses,
          Contacts.Fields.Birthday,
          Contacts.Fields.ImageAvailable,
        ]);

        if (!contact) throw new Error(`Contact not found: ${contactId}`);
        return formatContact(contact);
      },
    },
  },
  instructions: '',
};
