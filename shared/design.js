// Refresh only untouched starter copy; preserve text the owner has customized.
const replacements={
 announcement:['A little care. A new beginning.','FIP care essentials. Clear choices. All in one place.'],
 heroEyebrow:['A FRESH CHAPTER IN FELINE CARE','BIG LOVE. CLEAR CHOICES.'],
 heroTitle:['For their next beautiful chapter.','FIP care. Made clearer.'],
 heroText:['Thoughtfully chosen FIP care products and everyday essentials. Because every little life deserves a little more spring.','Explore vials, capsule packs and everyday supplies in one place. Clear formats. Straightforward choices. More focus on the cat you love.'],
 shopTitle:['Care, thoughtfully collected.','The care collection.'],
 shopText:['Find the essentials for your cat’s care journey. One less thing to figure out.','Find your format, compare pack options, and build a bag that works for your cat’s care plan.'],
 storyTitle:['They’re family. We understand.','Small paws. A big part of your life.'],
 storyText:['When your cat needs care, even the small decisions can feel big. Spring for Cats brings the essentials together in a calmer, clearer space.','When your cat needs care, clarity matters. Explore formats, compare packs and find the everyday supplies in one place.'],
 storyExtra:['Simple product information. An easy-to-browse collection. More room to focus on the little companion who matters most.','Keep your veterinarian at the heart of treatment decisions. We make the collection easier to navigate, so you can focus on the companion who matters most.'],
 closingTitle:['Here’s to a little more spring.','Big love. One clear next step.']
};
export function upgradeSiteDesign(input){const catalog=structuredClone(input);for(const [key,[before,after]]of Object.entries(replacements))if(catalog.content[key]===before)catalog.content[key]=after;return catalog;}
