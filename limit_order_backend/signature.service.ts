// import { verifyTypedData, hashTypedData, getAddress, type Hex } from 'viem';

// export const ORDER_TYPES = {
//     Order: [
//         { name: 'makerAsset', type: 'address' },
//         { name: 'takerAsset', type: 'address' },
//         { name: 'maker', type: 'address' },
//         { name: 'makingAmount', type: 'uint256' },
//         { name: 'takingAmount', type: 'uint256' },
//         { name: 'salt', type: 'uint256' },
//         { name: 'deadline', type: 'uint256' },
//     ],
// } as const;

// export interface OrderInput {
//     makerAsset: string;
//     takerAsset: string;
//     maker: string;
//     makingAmount: string;
//     takingAmount: string;
//     salt: string;
//     deadline: number;
// }

// export const getDomain = (chainId: number, verifyingContract: string) => ({
//     name: 'LimitOrderProtocol',
//     version: '1',
//     chainId,
//     verifyingContract: getAddress(verifyingContract),
// });

// export async function verifyOrderSignature(
//     order: OrderInput,
//     signature: string,
//     chainId: number,
//     verifyingContract: string
// ): Promise<boolean> {
//     try {
//         const domain = getDomain(chainId, verifyingContract);

//         // Format amounts as BigInt for viem
//         const message = {
//             ...order,
//             makingAmount: BigInt(order.makingAmount),
//             takingAmount: BigInt(order.takingAmount),
//             salt: BigInt(order.salt),
//             deadline: BigInt(order.deadline),
//         };

//         const isValid = await verifyTypedData({
//             address: getAddress(order.maker),
//             domain,
//             types: ORDER_TYPES,
//             primaryType: 'Order',
//             message,
//             signature: signature as Hex,
//         });

//         return isValid;
//     } catch (error) {
//         console.error('Signature verification failed:', error);
//         return false;
//     }
// }

// export function calculateOrderHash(
//     order: OrderInput,
//     chainId: number,
//     verifyingContract: string
// ): string {
//     const domain = getDomain(chainId, verifyingContract);
//     const message = {
//         ...order,
//         makingAmount: BigInt(order.makingAmount),
//         takingAmount: BigInt(order.takingAmount),
//         salt: BigInt(order.salt),
//         deadline: BigInt(order.deadline),
//     };

//     return hashTypedData({
//         domain,
//         types: ORDER_TYPES,
//         primaryType: 'Order',
//         message,
//     });
// }
