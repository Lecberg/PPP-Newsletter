if (!process.env.BREVO_API_KEY) throw new Error('BREVO_API_KEY is required.');
const headers = { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' };
const read = () => fetch('https://api.brevo.com/v3/contacts/attributes', { headers, signal: AbortSignal.timeout(15000) });
const initial = await read();
if (!initial.ok) throw new Error('Could not check Brevo contact fields.');
const field = (await initial.json()).attributes.find(a => a.name === 'NEWSLETTER_NAME' && a.category === 'normal');
if (field) {
  if (field.type !== 'text') throw new Error('NEWSLETTER_NAME exists but is not a text field.');
  console.log('Brevo newsletter name field is ready.');
} else {
  const result = await fetch('https://api.brevo.com/v3/contacts/attributes/normal/NEWSLETTER_NAME', {
    method: 'POST', headers, body: JSON.stringify({ type: 'text' }), signal: AbortSignal.timeout(15000)
  });
  if (!result.ok) throw new Error('Could not create the Brevo newsletter name field. No contacts were changed.');
  console.log('Created NEWSLETTER_NAME text field. No contacts were changed.');
}
