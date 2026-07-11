import {NextResponse} from 'next/server';
import OpenAI from 'openai';
import {createClient} from '@/utils/supabase/server';

export const runtime='nodejs';

const schema={
  type:'object',additionalProperties:false,
  properties:{
    title:{type:'string'},strategy:{type:'string'},hook:{type:'string'},caption:{type:'string'},cta:{type:'string'},
    shot_list:{type:'array',items:{type:'string'},minItems:4,maxItems:8},
    visual_prompt:{type:'string'},negative_prompt:{type:'string'},hashtags:{type:'array',items:{type:'string'},minItems:5,maxItems:12},
    best_time:{type:'string'},alternatives:{type:'array',items:{type:'string'},minItems:2,maxItems:3}
  },
  required:['title','strategy','hook','caption','cta','shot_list','visual_prompt','negative_prompt','hashtags','best_time','alternatives']
};

export async function POST(request:Request){
  const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:'Требуется авторизация'},{status:401});
  if(!process.env.OPENAI_API_KEY)return NextResponse.json({error:'OPENAI_API_KEY не настроен в Vercel'},{status:503});
  const body=await request.json();
  if(!body.topic||!body.model)return NextResponse.json({error:'Не указана тема или модель'},{status:400});
  try{
    const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
    const response=await client.responses.create({
      model:'gpt-5.4-mini',reasoning:{effort:'low'},store:false,max_output_tokens:3000,
      instructions:'Ты — главный креативный директор Atlas AI OS. Создавай уникальный, практически готовый к публикации контент на русском языке. Строго сохраняй личность, голос и внешность цифрового автора. Не изображай реальных людей и не используй вводящие в заблуждение заявления. Визуальный промпт пиши на английском для генератора изображений. Хэштеги возвращай с символом #.',
      input:`Создай полный контент-пакет.\nЦифровой автор: ${JSON.stringify(body.model)}\nПлощадка: ${body.platform}\nФормат: ${body.format}\nТема: ${body.topic}\nЦель: ${body.goal}\nАудитория и контекст должны точно соответствовать профилю. Дай конкретный сценарий, а не общие советы.`,
      text:{format:{type:'json_schema',name:'atlas_content_package',strict:true,schema}}
    });
    if(!response.output_text)throw new Error('Модель не вернула результат');
    return NextResponse.json(JSON.parse(response.output_text));
  }catch(error){console.error('Atlas generation failed',error);return NextResponse.json({error:'AI-генерация временно недоступна. Проверь баланс API и попробуй снова.'},{status:502})}
}
